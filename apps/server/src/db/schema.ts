// for `bun gen`

import { relations, sql } from "drizzle-orm"
import {
    type AnySQLiteColumn,
    index,
    integer,
    primaryKey,
    SQLiteColumn,
    type SQLiteTableWithColumns,
    sqliteTable,
    text,
    uniqueIndex,
} from "drizzle-orm/sqlite-core"
import { nanoid } from "nanoid"

/**
 * @description 生成当前时间戳，统一作为数据库时间字段默认值。
 * @returns 当前时间戳（毫秒）。
 */
export function now() {
    return Date.now()
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
        experience: integer("experience")
            .notNull()
            .$default(() => 0),
        points: integer("points")
            .notNull()
            .$default(() => 0),
        level: integer("level")
            .notNull()
            .$default(() => 1),
        selectedTitleAssetId: text("selected_title_asset_id"),
        selectedNameCardAssetId: text("selected_name_card_asset_id"),
        createdAt: integer("created_at").$default(now),
        updateAt: integer("update_at"),
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
    createdAt: integer("created_at").$default(now),
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
    createdAt: integer("created_at").$default(now),
    updateAt: integer("update_at").$onUpdate(now),
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
        expiresAt: integer("expires_at").notNull(),
        createdAt: integer("created_at").$default(now),
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
    createdAt: integer("created_at").$default(now),
    updateAt: integer("update_at").$onUpdate(now),
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
        replyToMsgId: text("reply_to_msg_id").references((): AnySQLiteColumn => msgs.id, { onDelete: "set null" }),
        replyToUserId: text("reply_to_user_id").references(() => users.id, { onDelete: "set null" }),
        content: text("content").notNull(),
        edited: integer("edited").$default(() => 0),
        createdAt: integer("created_at").$default(now),
        updateAt: integer("update_at").$onUpdate(now),
    },
    msgs => [index("msg_room_id_idx").on(msgs.roomId)]
)

export const msgsRelations = relations(msgs, ({ one, many }) => ({
    room: one(rooms, { fields: [msgs.roomId], references: [rooms.id], relationName: "room" }),
    user: one(users, { fields: [msgs.userId], references: [users.id], relationName: "user" }),
    replyTo: one(msgs, { fields: [msgs.replyToMsgId], references: [msgs.id], relationName: "reply" }),
    replyToUser: one(users, { fields: [msgs.replyToUserId], references: [users.id], relationName: "replyToUser" }),
    repliedMessages: many(msgs, { relationName: "reply" }),
    reactions: many(reactions),
}))

/** 反应 */
export const reactions = sqliteTable("reactions", {
    id: text("id").$default(id).primaryKey(),
    msgId: text("msg_id")
        .notNull()
        .references(() => msgs.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    createdAt: integer("created_at").$default(now),
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
        createdAt: integer("created_at").$default(now),
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
    createdAt: integer("created_at").$default(now),
    updateAt: integer("update_at").$onUpdate(now),
})

export const notificationsRelations = relations(notifications, ({ one }) => ({
    user: one(users, { fields: [notifications.userId], references: [users.id] }),
}))

/** 计划 */
export const schedules = sqliteTable("schedules", {
    id: text("id").$default(id).primaryKey(),
    name: text("name").notNull(),
    startTime: integer("start_time").notNull(),
    endTime: integer("end_time").notNull(),
    repeatType: text("repeat_type"),
    repeatInterval: integer("repeat_interval"),
    repeatCount: integer("repeat_count"),
    userId: text("user_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
    createdAt: integer("created_at").$default(now),
    updateAt: integer("update_at").$onUpdate(now),
})

export const schedulesRelations = relations(schedules, ({ one }) => ({
    user: one(users, { fields: [schedules.userId], references: [users.id] }),
}))

/** 用户经验奖励领取记录 */
export const userExperienceRewards = sqliteTable(
    "user_experience_rewards",
    {
        id: text("id").$default(id).primaryKey(),
        userId: text("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        source: text("source").notNull(),
        dateKey: text("date_key").notNull(),
        awardedExp: integer("awarded_exp").notNull(),
        createdAt: integer("created_at").$default(now),
    },
    table => [
        uniqueIndex("user_experience_reward_unique_idx").on(table.userId, table.source, table.dateKey),
        index("user_experience_reward_user_idx").on(table.userId),
    ]
)

export const userExperienceRewardsRelations = relations(userExperienceRewards, ({ one }) => ({
    user: one(users, { fields: [userExperienceRewards.userId], references: [users.id] }),
}))

/** 商店奖励资产 */
export const shopAssets = sqliteTable(
    "shop_assets",
    {
        id: text("id").$default(id).primaryKey(),
        rewardType: text("reward_type").notNull(),
        rewardKey: text("reward_key").notNull(),
        rewardName: text("reward_name").notNull(),
        displayClass: text("display_class"),
        displayCss: text("display_css"),
        createdAt: integer("created_at").$default(now),
        updateAt: integer("update_at").$onUpdate(now),
    },
    table => [
        uniqueIndex("shop_assets_reward_key_unique_idx").on(table.rewardType, table.rewardKey),
        index("shop_assets_reward_type_idx").on(table.rewardType),
    ]
)

/** 商店商品 */
export const shopProducts = sqliteTable(
    "shop_products",
    {
        id: text("id").$default(id).primaryKey(),
        name: text("name").notNull(),
        description: text("description"),
        assetId: text("asset_id")
            .notNull()
            .references(() => shopAssets.id, { onDelete: "cascade" }),
        pointsCost: integer("points_cost").notNull(),
        sortOrder: integer("sort_order")
            .notNull()
            .$default(() => 0),
        isActive: integer("is_active")
            .notNull()
            .$default(() => 1),
        startTime: integer("start_time"),
        endTime: integer("end_time"),
        createdAt: integer("created_at").$default(now),
        updateAt: integer("update_at").$onUpdate(now),
    },
    table => [
        index("shop_products_asset_idx").on(table.assetId),
        index("shop_products_active_sort_idx").on(table.isActive, table.sortOrder),
    ]
)

/** 用户商店已拥有资产 */
export const userShopItems = sqliteTable(
    "user_shop_items",
    {
        id: text("id").$default(id).primaryKey(),
        userId: text("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        assetId: text("asset_id")
            .notNull()
            .references(() => shopAssets.id, { onDelete: "cascade" }),
        createdAt: integer("created_at").$default(now),
    },
    table => [uniqueIndex("user_shop_item_unique_idx").on(table.userId, table.assetId), index("user_shop_item_user_idx").on(table.userId)]
)

/** 商店兑换记录 */
export const shopRedemptions = sqliteTable(
    "shop_redemptions",
    {
        id: text("id").$default(id).primaryKey(),
        userId: text("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        productId: text("product_id")
            .notNull()
            .references(() => shopProducts.id, { onDelete: "cascade" }),
        assetId: text("asset_id")
            .notNull()
            .references(() => shopAssets.id, { onDelete: "cascade" }),
        pointsCost: integer("points_cost").notNull(),
        createdAt: integer("created_at").$default(now),
    },
    table => [
        index("shop_redemptions_user_idx").on(table.userId),
        index("shop_redemptions_product_idx").on(table.productId),
        index("shop_redemptions_asset_idx").on(table.assetId),
    ]
)

export const shopAssetsRelations = relations(shopAssets, ({ many }) => ({
    products: many(shopProducts),
    userItems: many(userShopItems),
    redemptions: many(shopRedemptions),
}))

export const shopProductsRelations = relations(shopProducts, ({ one, many }) => ({
    asset: one(shopAssets, { fields: [shopProducts.assetId], references: [shopAssets.id] }),
    userItems: many(userShopItems),
    redemptions: many(shopRedemptions),
}))

export const userShopItemsRelations = relations(userShopItems, ({ one }) => ({
    user: one(users, { fields: [userShopItems.userId], references: [users.id] }),
    asset: one(shopAssets, { fields: [userShopItems.assetId], references: [shopAssets.id] }),
}))

export const shopRedemptionsRelations = relations(shopRedemptions, ({ one }) => ({
    user: one(users, { fields: [shopRedemptions.userId], references: [users.id] }),
    product: one(shopProducts, { fields: [shopRedemptions.productId], references: [shopProducts.id] }),
    asset: one(shopAssets, { fields: [shopRedemptions.assetId], references: [shopAssets.id] }),
}))

/** 任务 */
export const tasks = sqliteTable("tasks", {
    id: text("id").$default(id).primaryKey(),
    name: text("name").notNull(),
    desc: text("desc"),
    startTime: integer("start_time"),
    endTime: integer("end_time"),
    maxUser: integer("max_user").notNull(),
    maxAge: integer("max_age"),
    userList: text("user_list", { mode: "json" }).notNull().$type<Array<string>>(),
    roomId: text("room_id")
        .notNull()
        .references(() => rooms.id, { onDelete: "cascade" }),
    userId: text("user_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
    createdAt: integer("created_at").$default(now),
    updateAt: integer("update_at").$onUpdate(now),
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
        createdAt: integer("created_at").$default(now),
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
        createdAt: integer("created_at").$default(now),
        updateAt: integer("update_at").$onUpdate(now),
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
        createdAt: integer("created_at").$default(now),
        updateAt: integer("update_at").$onUpdate(now),
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
        createdAt: integer("created_at").$default(now),
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
    expiresAt: integer("expires_at").notNull(),
    createdAt: integer("created_at").$default(now),
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
        createdAt: integer("created_at").$default(now),
        updateAt: integer("update_at").$onUpdate(now),
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
    graphs: many(graphs),
    graphLikes: many(graphLikes),
    dyePlans: many(dyePlans),
    dyePlanLikes: many(dyePlanLikes),
    comments: many(comments),
    timelines: many(timelines),
    timelineLikes: many(timelineLikes),
    scripts: many(scripts),
    scriptLikes: many(scriptLikes),
    userExperienceRewards: many(userExperienceRewards),
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
        startTime: integer("start_time"),
        endTime: integer("end_time"),
        type: text("type").notNull(), // 'user' | 'system'
        userId: text("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        createdAt: integer("created_at").$default(now),
        updateAt: integer("update_at").$onUpdate(now),
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
        completedAt: integer("completed_at").$default(now),
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
        /** 构筑类型（普通 / 升华）：写构筑时由服务端按 charSettings 判定，供列表过滤 */
        buildType: text("build_type", { enum: ["normal", "transcend"] })
            .notNull()
            .default("normal"),
        userId: text("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        views: integer("views").default(0),
        likes: integer("likes").default(0),
        isRecommended: integer("is_recommended", { mode: "boolean" }).default(false),
        isPinned: integer("is_pinned", { mode: "boolean" }).default(false),
        createdAt: integer("created_at").$default(now),
        updateAt: integer("update_at"),
    },
    builds => [
        index("builds_char_id_idx").on(builds.charId),
        index("builds_build_type_idx").on(builds.buildType),
        index("builds_user_id_idx").on(builds.userId),
        index("builds_is_recommended_idx").on(builds.isRecommended),
        index("builds_char_id_update_at_idx").on(builds.charId, builds.updateAt),
        index("builds_char_id_views_idx").on(builds.charId, builds.views),
        index("builds_update_at_idx").on(builds.updateAt),
        index("builds_views_idx").on(builds.views),
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
        createdAt: integer("created_at").$default(now),
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

/** 节点图分享：对标 builds，存整张节点图的 nodes/edges JSON */
export const graphs = sqliteTable(
    "graphs",
    {
        id: text("id").$default(id).primaryKey(),
        title: text("title").notNull(),
        desc: text("desc"),
        graphData: text("graph_data").notNull(),
        graphInfo: text("graph_info"),
        userId: text("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        views: integer("views").default(0),
        likes: integer("likes").default(0),
        isRecommended: integer("is_recommended", { mode: "boolean" }).default(false),
        isPinned: integer("is_pinned", { mode: "boolean" }).default(false),
        createdAt: integer("created_at").$default(now),
        updateAt: integer("update_at"),
    },
    graphs => [
        index("graphs_user_id_idx").on(graphs.userId),
        index("graphs_is_recommended_idx").on(graphs.isRecommended),
        index("graphs_update_at_idx").on(graphs.updateAt),
        index("graphs_views_idx").on(graphs.views),
    ]
)

export const graphsRelations = relations(graphs, ({ one, many }) => ({
    user: one(users, { fields: [graphs.userId], references: [users.id] }),
    likes: many(graphLikes),
}))

/** 节点图点赞 */
export const graphLikes = sqliteTable(
    "graph_likes",
    {
        id: text("id").$default(id).primaryKey(),
        graphId: text("graph_id")
            .notNull()
            .references(() => graphs.id, { onDelete: "cascade" }),
        userId: text("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        createdAt: integer("created_at").$default(now),
    },
    graphLikes => [
        uniqueIndex("graph_like_idx").on(graphLikes.userId, graphLikes.graphId),
        index("graph_like_graph_idx").on(graphLikes.graphId),
    ]
)

export const graphLikesRelations = relations(graphLikes, ({ one }) => ({
    graph: one(graphs, { fields: [graphLikes.graphId], references: [graphs.id] }),
    user: one(users, { fields: [graphLikes.userId], references: [users.id] }),
}))

/** 染色方案分享 */
export const dyePlans = sqliteTable(
    "dye_plans",
    {
        id: text("id").$default(id).primaryKey(),
        title: text("title").notNull(),
        desc: text("desc"),
        type: text("type").notNull().default("Char"),
        skinId: integer("skin_id").notNull(),
        colorIds: text("color_ids").notNull(),
        /** 可选的发型染色码（H 开头游戏社区码），仅保存代码，不存发型 ID。 */
        hairCode: text("hair_code"),
        imageUrl: text("image_url"),
        /** 是否原创，false 表示转载。 */
        isOriginal: integer("is_original", { mode: "boolean" }).notNull().default(true),
        /** 转载来源链接或作者名称，转载时必填。 */
        source: text("source"),
        userId: text("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        views: integer("views").default(0),
        likes: integer("likes").default(0),
        isRecommended: integer("is_recommended", { mode: "boolean" }).default(false),
        isPinned: integer("is_pinned", { mode: "boolean" }).default(false),
        createdAt: integer("created_at").$default(now),
        updateAt: integer("update_at"),
    },
    dyePlans => [
        index("dye_plans_user_id_idx").on(dyePlans.userId),
        index("dye_plans_skin_id_idx").on(dyePlans.skinId),
        index("dye_plans_type_idx").on(dyePlans.type),
        index("dye_plans_update_at_idx").on(dyePlans.updateAt),
        index("dye_plans_views_idx").on(dyePlans.views),
    ]
)

export const dyePlansRelations = relations(dyePlans, ({ one, many }) => ({
    user: one(users, { fields: [dyePlans.userId], references: [users.id] }),
    likes: many(dyePlanLikes),
}))

/** 染色方案点赞 */
export const dyePlanLikes = sqliteTable(
    "dye_plan_likes",
    {
        id: text("id").$default(id).primaryKey(),
        dyePlanId: text("dye_plan_id")
            .notNull()
            .references(() => dyePlans.id, { onDelete: "cascade" }),
        userId: text("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        createdAt: integer("created_at").$default(now),
    },
    dyePlanLikes => [
        uniqueIndex("dye_plan_like_idx").on(dyePlanLikes.userId, dyePlanLikes.dyePlanId),
        index("dye_plan_like_plan_idx").on(dyePlanLikes.dyePlanId),
    ]
)

export const dyePlanLikesRelations = relations(dyePlanLikes, ({ one }) => ({
    dyePlan: one(dyePlans, { fields: [dyePlanLikes.dyePlanId], references: [dyePlans.id] }),
    user: one(users, { fields: [dyePlanLikes.userId], references: [users.id] }),
}))

/** 通用评论，targetId 为评论目标唯一 ID（如染色方案使用 dp_<planId>）。 */
export const comments = sqliteTable(
    "comments",
    {
        id: text("id").$default(id).primaryKey(),
        /** 评论目标唯一 ID，不同业务模块使用不同前缀，如染色方案 dp_<planId>。 */
        targetId: text("target_id").notNull(),
        userId: text("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        content: text("content").notNull(),
        createdAt: integer("created_at").$default(now),
    },
    comments => [
        index("comments_target_id_idx").on(comments.targetId, comments.createdAt),
        index("comments_user_id_idx").on(comments.userId),
    ]
)

export const commentsRelations = relations(comments, ({ one }) => ({
    user: one(users, { fields: [comments.userId], references: [users.id] }),
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
        createdAt: integer("created_at").$default(now),
        updateAt: integer("update_at").$onUpdate(now),
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
        createdAt: integer("created_at").$default(now),
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

/** 榜单 */
export const rankingLists = sqliteTable(
    "ranking_lists",
    {
        id: text("id").$default(id).primaryKey(),
        name: text("name").notNull(),
        desc: text("desc"),
        createdAt: integer("created_at").$default(now),
        updateAt: integer("update_at").$onUpdate(now),
    },
    rankingLists => [index("ranking_lists_name_idx").on(rankingLists.name), index("ranking_lists_update_at_idx").on(rankingLists.updateAt)]
)

/** 榜单条目 */
export const rankingListItems = sqliteTable(
    "ranking_list_items",
    {
        id: text("id").$default(id).primaryKey(),
        rankingListId: text("ranking_list_id")
            .notNull()
            .references(() => rankingLists.id, { onDelete: "cascade" }),
        charId: integer("char_id").notNull(),
        buildId: text("build_id")
            .notNull()
            .references(() => builds.id, { onDelete: "cascade" }),
        sortOrder: integer("sort_order").$default(() => 0),
        createdAt: integer("created_at").$default(now),
        updateAt: integer("update_at").$onUpdate(now),
    },
    rankingListItems => [
        index("ranking_list_items_ranking_list_id_idx").on(rankingListItems.rankingListId),
        index("ranking_list_items_char_id_idx").on(rankingListItems.charId),
        index("ranking_list_items_build_id_idx").on(rankingListItems.buildId),
        index("ranking_list_items_sort_order_idx").on(rankingListItems.sortOrder),
    ]
)

export const rankingListItemsRelations = relations(rankingListItems, ({ one }) => ({
    rankingList: one(rankingLists, { fields: [rankingListItems.rankingListId], references: [rankingLists.id] }),
    build: one(builds, { fields: [rankingListItems.buildId], references: [builds.id] }),
}))

export const rankingListsRelations = relations(rankingLists, ({ many }) => ({
    items: many(rankingListItems),
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
        createdAt: integer("created_at").$default(now),
        updateAt: integer("update_at").$onUpdate(now),
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

/** 深渊使用提交 */
export const abyssUsageSubmissions = sqliteTable(
    "abyss_usage_submissions",
    {
        id: text("id").$default(id).primaryKey(),
        uidSha256: text("uid_sha256").notNull(),
        seasonId: integer("season_id").notNull(),
        level: integer("level"),
        charId: integer("char_id").notNull(),
        meleeId: integer("melee_id").notNull(),
        rangedId: integer("ranged_id").notNull(),
        support1: integer("support_1").notNull(),
        supportWeapon1: integer("support_weapon_1").notNull(),
        support2: integer("support_2").notNull(),
        supportWeapon2: integer("support_weapon_2").notNull(),
        petId: integer("pet_id"),
        stars: integer("stars").notNull(),
        createdAt: integer("created_at").$default(now),
        updateAt: integer("update_at").$onUpdate(now),
    },
    submissions => [
        uniqueIndex("abyss_usage_submissions_season_uid_idx").on(submissions.uidSha256, submissions.seasonId),
        index("abyss_usage_submissions_season_id_idx").on(submissions.seasonId),
        index("abyss_usage_submissions_season_id_level_idx").on(submissions.seasonId, submissions.level),
        index("abyss_usage_submissions_lineup_idx").on(
            submissions.seasonId,
            submissions.charId,
            submissions.meleeId,
            submissions.rangedId,
            submissions.support1,
            submissions.supportWeapon1,
            submissions.support2,
            submissions.supportWeapon2,
            submissions.petId
        ),
    ]
)

/** 深渊使用角色明细 */
export const abyssUsageRoleParticipants = sqliteTable(
    "abyss_usage_role_participants",
    {
        id: text("id").$default(id).primaryKey(),
        submissionId: text("submission_id")
            .notNull()
            .references(() => abyssUsageSubmissions.id, { onDelete: "cascade" }),
        seasonId: integer("season_id").notNull(),
        roleType: text("role_type").notNull(),
        charId: integer("char_id").notNull(),
        gradeLevel: integer("grade_level").notNull(),
        createdAt: integer("created_at").$default(now),
    },
    participants => [
        index("abyss_usage_role_participants_season_id_idx").on(participants.seasonId),
        index("abyss_usage_role_participants_submission_id_idx").on(participants.submissionId),
        index("abyss_usage_role_participants_char_id_idx").on(participants.charId),
        index("abyss_usage_role_participants_role_type_idx").on(participants.roleType),
    ]
)

/** 深渊使用武器明细 */
export const abyssUsageWeaponParticipants = sqliteTable(
    "abyss_usage_weapon_participants",
    {
        id: text("id").$default(id).primaryKey(),
        submissionId: text("submission_id")
            .notNull()
            .references(() => abyssUsageSubmissions.id, { onDelete: "cascade" }),
        seasonId: integer("season_id").notNull(),
        roleType: text("role_type").notNull(),
        weaponId: integer("weapon_id").notNull(),
        skillLevel: integer("skill_level").notNull(),
        createdAt: integer("created_at").$default(now),
    },
    participants => [
        index("abyss_usage_weapon_participants_season_id_idx").on(participants.seasonId),
        index("abyss_usage_weapon_participants_submission_id_idx").on(participants.submissionId),
        index("abyss_usage_weapon_participants_weapon_id_idx").on(participants.weaponId),
        index("abyss_usage_weapon_participants_role_type_idx").on(participants.roleType),
    ]
)

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
        createdAt: integer("created_at").$default(now),
        updateAt: integer("update_at"),
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

/** 脚本分类 */
export const scriptCategories = sqliteTable(
    "script_categories",
    {
        id: text("id").$default(id).primaryKey(),
        name: text("name").notNull(),
        description: text("description"),
        createdAt: integer("created_at").$default(now),
        updateAt: integer("update_at").$onUpdate(now),
    },
    scriptCategories => [uniqueIndex("script_categories_name_idx").on(scriptCategories.name)]
)

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
        createdAt: integer("created_at").$default(now),
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

/**
 * 游戏补丁 MOD 分享（非游戏内 mod，而是替换/新增游戏资源的补丁包）。
 * 一个「发布」包含名称/描述/封面等元数据，其下可挂多个版本（game_mod_versions，版本号 + 更新说明 + 独立压缩包）。
 * 用户上传 zip 压缩包，服务端解析并补全 mod.json 与 preview.png，供其他用户查询、下载并一键安装到启动器。
 */
export const gameMods = sqliteTable(
    "game_mods",
    {
        id: text("id").$default(id).primaryKey(),
        name: text("name").notNull(),
        description: text("description"),
        /** 适用分类：char | weapon | other | standalone（独立），未指定时默认为 standalone。 */
        category: text("category")
            .notNull()
            .$default(() => "standalone"),
        /** 适用实体名称（角色名/武器名/自定义实体名），独立分类时为空字符串。 */
        entity: text("entity"),
        /** 封面 OSS 对象 key（mods/hash/<sha256>.<ext>），可能为空。 */
        coverKey: text("cover_key"),
        /** 服务端补全后的 mod.json 内容（字符串）。 */
        modJson: text("mod_json"),
        /** 来源链接（http/https），空表示原创。 */
        source: text("source"),
        /** 需要的前置 MOD 名称/ID 列表。 */
        requires: text("requires", { mode: "json" }).$type<string[]>(),
        userId: text("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        /** 全部版本累计下载次数（冗余计数，实际下载按版本记录）。 */
        downloads: integer("downloads")
            .notNull()
            .$default(() => 0),
        views: integer("views")
            .notNull()
            .$default(() => 0),
        likes: integer("likes")
            .notNull()
            .$default(() => 0),
        /** 是否上架展示，管理员可下架。 */
        isActive: integer("is_active", { mode: "boolean" })
            .notNull()
            .$default(() => true),
        /** 审核状态：pending（待审核）| approved（已通过）| rejected（已拒绝），发布后需管理员审核通过才对其他用户可见。 */
        status: text("status")
            .notNull()
            .$default(() => "pending"),
        /** 预览图（非封面）OSS 对象 key 列表（JSON 数组字符串，如 mods/hash/<sha256>.png）。 */
        images: text("images", { mode: "json" }).$type<string[]>(),
        isRecommended: integer("is_recommended", { mode: "boolean" })
            .notNull()
            .$default(() => false),
        isPinned: integer("is_pinned", { mode: "boolean" })
            .notNull()
            .$default(() => false),
        createdAt: integer("created_at").$default(now),
        /**
         * 内容最后更新时间，仅在发布/版本/元数据等实质变更时显式写入 schema.now()（与 builds 一致）。
         * 刻意不使用 $onUpdate：下载计数、浏览量等计数器自增不属于内容更新，不应把 MOD 顶到「最近更新」列表最前。
         */
        updateAt: integer("update_at"),
    },
    gameMods => [
        index("game_mods_category_idx").on(gameMods.category),
        index("game_mods_entity_idx").on(gameMods.entity),
        index("game_mods_user_id_idx").on(gameMods.userId),
        index("game_mods_created_at_idx").on(gameMods.createdAt),
        index("game_mods_is_active_idx").on(gameMods.isActive),
    ]
)

/**
 * 游戏补丁 MOD 的版本记录。
 * 同一发布（game_mods）下可上传多个版本，每个版本有独立的压缩包、版本号与更新说明。
 */
export const gameModVersions = sqliteTable(
    "game_mod_versions",
    {
        id: text("id").$default(id).primaryKey(),
        modId: text("mod_id")
            .notNull()
            .references(() => gameMods.id, { onDelete: "cascade" }),
        /** 版本号/标签（如 1.0.0 / v2）。 */
        version: text("version").notNull(),
        /** 该版本的更新说明（支持 markdown）。 */
        changelog: text("changelog"),
        /** 原始上传文件名。 */
        fileName: text("file_name").notNull(),
        /** OSS 对象 key（mods/hash/<sha256>.zip，文件名使用内容哈希）。 */
        fileKey: text("file_key").notNull(),
        /** 压缩包大小（字节）。 */
        fileSize: integer("file_size").notNull(),
        /** 该版本的下载次数。 */
        downloads: integer("downloads")
            .notNull()
            .$default(() => 0),
        createdAt: integer("created_at").$default(now),
    },
    gameModVersions => [
        index("game_mod_versions_mod_id_idx").on(gameModVersions.modId),
        index("game_mod_versions_created_at_idx").on(gameModVersions.createdAt),
    ]
)

export const gameModsRelations = relations(gameMods, ({ one, many }) => ({
    user: one(users, { fields: [gameMods.userId], references: [users.id] }),
    versions: many(gameModVersions),
}))

export const gameModVersionsRelations = relations(gameModVersions, ({ one }) => ({
    mod: one(gameMods, { fields: [gameModVersions.modId], references: [gameMods.id] }),
}))

/**
 * AI 中转接口的每日用量与费用（按「用户 + 北京自然日」聚合）。
 *
 * 用途：`/api/v1/chat/completions` 代理改为登录账号计费后，
 * 每次请求前按本表当日累计费用判断是否还在每日额度内，请求完成后把本次用量原子累加进来。
 *
 * 费用用「微元」整数存储（1 元 = 1_000_000 微元）而不是浮点数：
 * DeepSeek 单价是「元 / 百万 tokens」，数值上恰好等于「微元 / token」，
 * 于是 `费用(微元) = tokens × 单价` 是整数乘法，避免浮点累加误差。
 */
export const aiUsageDaily = sqliteTable(
    "ai_usage_daily",
    {
        userId: text("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        /** 北京时间自然日 YYYY-MM-DD（额度按北京时间的自然日重置，与 DeepSeek 峰谷时段同一时区）。 */
        day: text("day").notNull(),
        /** 输入 tokens 中命中上下文缓存的部分（单价最低）。 */
        cacheHitTokens: integer("cache_hit_tokens")
            .notNull()
            .$default(() => 0),
        /** 输入 tokens 中未命中缓存的部分。 */
        cacheMissTokens: integer("cache_miss_tokens")
            .notNull()
            .$default(() => 0),
        /** 输出 tokens。 */
        outputTokens: integer("output_tokens")
            .notNull()
            .$default(() => 0),
        /** 当日累计费用（微元，1 元 = 1_000_000 微元）。 */
        costMicros: integer("cost_micros")
            .notNull()
            .$default(() => 0),
        /** 当日成功发起并记账的请求次数。 */
        requests: integer("requests")
            .notNull()
            .$default(() => 0),
        createdAt: integer("created_at").$default(now),
        updateAt: integer("update_at"),
    },
    table => [primaryKey({ columns: [table.userId, table.day] })]
)

export const aiUsageDailyRelations = relations(aiUsageDaily, ({ one }) => ({
    user: one(users, { fields: [aiUsageDaily.userId], references: [users.id] }),
}))

/**
 * AI 充值兑换码（token 充值功能）。
 *
 * 一张码对应一份一次性额度（`amountMicros` 微元），由管理员批量生成、用户在前端输入兑换。
 * 码本身无用户归属，兑换后把面额累加到 `aiRechargeCredits`（永久有效）；
 * 码可以过期（`expiresAt` 为空表示永久有效），但到账额度永不过期。
 *
 * 码形 `XXXX-XXXX-XXXX`（`[A-Z0-9]`，生成时剔除易混淆的 `0O1I`）；
 * 兑换时归一化（去空格/横杠、转大写）后严格匹配，不做 `O→0` 之类猜测。
 */
export const aiRechargeCodes = sqliteTable(
    "ai_recharge_codes",
    {
        /** 归一化后的码文本（`XXXX-XXXX-XXXX` 大写），主键即唯一约束。 */
        code: text("code").primaryKey(),
        /** 面额（微元，1 元 = 1_000_000 微元）。 */
        amountMicros: integer("amount_micros").notNull(),
        /** 同一批次 ID（自动生成 nanoid，整批查询/作废用）。 */
        batchId: text("batch_id").notNull(),
        /** 状态：unused（未用）| redeemed（已兑）| revoked（已作废）。 */
        status: text("status")
            .notNull()
            .$default(() => "unused"),
        /** 过期时间戳（毫秒），为空表示永久有效。 */
        expiresAt: integer("expires_at"),
        /** 兑换人，兑换后写入。 */
        redeemedBy: text("redeemed_by").references(() => users.id, { onDelete: "set null" }),
        /** 兑换时间戳（毫秒）。 */
        redeemedAt: integer("redeemed_at"),
        /** 生成人（管理员）。 */
        createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
        createdAt: integer("created_at").$default(now),
    },
    table => [index("ai_recharge_codes_batch_idx").on(table.batchId), index("ai_recharge_codes_status_idx").on(table.status)]
)

export const aiRechargeCodesRelations = relations(aiRechargeCodes, ({ one }) => ({
    redeemer: one(users, { fields: [aiRechargeCodes.redeemedBy], references: [users.id] }),
}))

/**
 * 用户充值额度余额（永久有效，不随自然日重置）。
 *
 * 免费额度是隐式的（`DAILY_LIMIT - 当日已用`），只存在充值的显式余额表里：
 * 兑换时累加面额，请求费用超出当日免费部分时扣减溢出额。
 */
export const aiRechargeCredits = sqliteTable("ai_recharge_credits", {
    userId: text("user_id")
        .primaryKey()
        .references(() => users.id, { onDelete: "cascade" }),
    /** 当前剩余额度（微元）。 */
    balanceMicros: integer("balance_micros")
        .notNull()
        .$default(() => 0),
    /** 历史累计兑换（微元，仅审计展示）。 */
    totalRedeemedMicros: integer("total_redeemed_micros")
        .notNull()
        .$default(() => 0),
    /** 历史累计抵扣（微元，仅审计展示）。 */
    totalSpentMicros: integer("total_spent_micros")
        .notNull()
        .$default(() => 0),
    createdAt: integer("created_at").$default(now),
    updateAt: integer("update_at"),
})

export const aiRechargeCreditsRelations = relations(aiRechargeCredits, ({ one }) => ({
    user: one(users, { fields: [aiRechargeCredits.userId], references: [users.id] }),
}))

/* ------------------------------------------------------------------------------------------------------------------
 * 游戏 BUG 收集、AI 归并与 GitHub 双向协作（契约：specs/game-bug-intake.md §8）
 * 这些表只由服务端 BUG Module 的领域事务读写，不注册为通用 CRUD 入口。
 * ---------------------------------------------------------------------------------------------------------------- */

/** 一次反馈（Submission）的处理状态，spec §9.1。 */
export type BugSubmissionState =
    | "received"
    | "queued"
    | "processing"
    | "processed"
    | "needs_info"
    | "privacy_blocked"
    | "filtered"
    | "retry_wait"
    | "failed"
    | "withdrawn"

/** 规范 BUG 状态，spec §9.2。 */
export type BugStatus =
    | "untriaged"
    | "needs_info"
    | "confirmed"
    | "in_progress"
    | "resolved"
    | "closed"
    | "reopen_requested"
    | "duplicate"
    | "rejected"

/** 严重程度，spec §14.2。 */
export type BugSeverity = "S0" | "S1" | "S2" | "S3" | "S4" | "U"

/** 可见性：private 不出现在公开库、搜索结果与 GitHub 导出中。 */
export type BugVisibility = "public" | "private"

/** 公开发布策略，spec §10。 */
export type BugPublicationPolicy = "internal_only" | "catalog_safe" | "github_safe"

/** 领域事件来源身份；不保存邮箱、IP 或回执 token 原文。 */
export type BugActorRef = { kind: "user" | "anonymous" | "system" | "worker" | "github"; id: string }

/** 自报环境，缺失字段表示未知。 */
export type BugEnvironment = {
    platform?: string | null
    region?: string | null
    gameVersion?: string | null
    frequency?: string | null
}

/** AI 抽取的证据引用，spec §11.2（文字用 code point 偏移，图片用 0..1 归一化坐标）。 */
export type BugEvidenceRef =
    | { type: "text"; versionId: string; start: number; end: number; quote: string }
    | { type: "image"; assetId: string; region: [number, number, number, number] | null; observation: string }

/** 站内关联类型，spec §12.4。 */
export type BugRelationType = "possible_duplicate" | "related" | "regression_of" | "duplicate_of"

/** 评论来源，spec §16。 */
export type BugDiscussionSource = "local" | "github" | "system"

/** 再次反馈的复现结论，"未遇到"不等于反对票。 */
export type BugReproductionResult = "reproduced" | "not_reproduced" | "unknown"

/** 后台任务状态，spec §13.2。 */
export type BugJobState = "queued" | "running" | "retry_wait" | "awaiting_input" | "cancelled" | "failed" | "completed"

/** 任务优先级，仅由可信策略分配。 */
export type BugJobPriority = "critical" | "high" | "normal" | "low"

/** 出站操作状态，spec §17.2。 */
export type BugOutboxState = "queued" | "sending" | "delivered" | "retry_wait" | "unknown_effect" | "blocked" | "conflict" | "failed"

/** Issue 映射角色：每个 Bug + 仓库只有一个当前 primary。 */
export type GithubIssueLinkRole = "primary" | "legacy_duplicate"

/** Webhook Inbox 消费状态。 */
export type BugInboxState = "pending" | "processing" | "consumed" | "ignored" | "failed"

/** AI run 的 token 用量。 */
export type BugTokenUsage = { inputTokens?: number; outputTokens?: number; cachedInputTokens?: number; imageCalls?: number }

/** 请求幂等键：同 actor + op + key 只产生一次业务效果，重放返回同一结果。 */
export const bugIdempotencyKeys = sqliteTable(
    "bug_idempotency_keys",
    {
        /** 身份键，如 `user:<id>` / `anon:<anonActorId>`。 */
        actorKey: text("actor_key").notNull(),
        /** 操作名，如 `submit` / `addFeedback`。 */
        op: text("op").notNull(),
        /** 客户端生成的随机幂等键。 */
        key: text("key").notNull(),
        /** 请求体摘要，同键不同 payload 判为 conflict。 */
        requestHash: text("request_hash").notNull(),
        /** 首次成功结果（submissionId 等），重放时原样返回。 */
        resultId: text("result_id"),
        createdAt: integer("created_at").$default(now),
    },
    table => [primaryKey({ columns: [table.actorKey, table.op, table.key] })]
)

/** 原始反馈：先持久化再回执，匿名与登录作者并存。 */
export const bugSubmissions = sqliteTable(
    "bug_submissions",
    {
        id: text("id").$default(id).primaryKey(),
        gameId: text("game_id").notNull(),
        /** 登录作者；与 anonActorId 二选一。 */
        userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
        /** 匿名作者标识（不含回执 token 原文）。 */
        anonActorId: text("anon_actor_id"),
        /** 回执 token 的 SHA-256 摘要；登录用户为空。 */
        receiptDigest: text("receipt_digest"),
        state: text("state").$type<BugSubmissionState>().notNull().default("received"),
        /** 当前版本号（`bug_submission_versions.revision`）。 */
        currentRevision: integer("current_revision").notNull().default(0),
        createdAt: integer("created_at").$default(now),
        /** 原始私有内容保留截止时间（毫秒）。 */
        retentionUntil: integer("retention_until"),
    },
    table => [
        index("bug_submissions_game_state_idx").on(table.gameId, table.state),
        index("bug_submissions_user_idx").on(table.userId),
        index("bug_submissions_anon_actor_idx").on(table.anonActorId),
        uniqueIndex("bug_submissions_receipt_uq").on(table.receiptDigest),
    ]
)

/** 反馈版本：只追加不覆盖，保留作者原文与发布策略。 */
export const bugSubmissionVersions = sqliteTable(
    "bug_submission_versions",
    {
        submissionId: text("submission_id")
            .notNull()
            .references(() => bugSubmissions.id, { onDelete: "cascade" }),
        revision: integer("revision").notNull(),
        /** 作者原文（私有），逻辑上不可被 AI 改写。 */
        rawTextPrivate: text("raw_text_private"),
        contentSha256: text("content_sha256").notNull(),
        context: text("context", { mode: "json" }).$type<BugEnvironment>(),
        publicationPolicy: text("publication_policy").$type<BugPublicationPolicy>().notNull().default("internal_only"),
        createdAt: integer("created_at").$default(now),
    },
    table => [primaryKey({ columns: [table.submissionId, table.revision] })]
)

/** 上传图片：原图永远私有，只有通过策略的脱敏派生图可公开。 */
export const bugAssets = sqliteTable(
    "bug_assets",
    {
        id: text("id").$default(id).primaryKey(),
        /** 版本键（`bug_submission_versions` 为复合主键，这里存调用方的版本标识）。 */
        submissionVersionId: text("submission_version_id").notNull(),
        privateObjectKey: text("private_object_key").notNull(),
        sha256: text("sha256").notNull(),
        /** 魔数校验得到的真实 MIME，不信任上传扩展名。 */
        actualMime: text("actual_mime").notNull(),
        bytes: integer("bytes").notNull(),
        dimensions: text("dimensions", { mode: "json" }).$type<{ width: number; height: number }>(),
        /** 安全扫描状态：pending / clean / rejected / failed。 */
        scanState: text("scan_state").notNull().default("pending"),
        /** 脱敏状态：pending / redacted / not_required / failed。 */
        redactionState: text("redaction_state").notNull().default("pending"),
        /** 可公开的派生图对象 key；为空表示没有可公开素材。 */
        publicDerivativeKey: text("public_derivative_key"),
        publicationPolicy: text("publication_policy").$type<BugPublicationPolicy>().notNull().default("internal_only"),
        createdAt: integer("created_at").$default(now),
    },
    table => [
        index("bug_assets_version_idx").on(table.submissionVersionId),
        index("bug_assets_sha_idx").on(table.sha256),
        index("bug_assets_scan_idx").on(table.scanState),
    ]
)

/** 规范 BUG：可能汇集多个反馈，不代表已经复现。 */
export const bugs = sqliteTable(
    "bugs",
    {
        id: text("id").$default(id).primaryKey(),
        /** 对外展示编号（如 `BUG-123`）。 */
        displayKey: text("display_key").notNull(),
        gameId: text("game_id").notNull(),
        primaryCategory: text("primary_category").notNull().default("other"),
        /** 规范 tagKey 投影。 */
        tags: text("tags", { mode: "json" }).$type<string[]>().notNull().default([]),
        title: text("title").notNull(),
        summary: text("summary").notNull(),
        expected: text("expected"),
        actual: text("actual"),
        steps: text("steps", { mode: "json" }).$type<string[]>().notNull().default([]),
        environment: text("environment", { mode: "json" }).$type<BugEnvironment>(),
        status: text("status").$type<BugStatus>().notNull().default("untriaged"),
        /** GitHub state_reason 语义：completed / not_planned / duplicate / unknown。 */
        resolution: text("resolution"),
        /** 修复阶段 tagKey（`fix.*`），权威来源见 fixStageSource。 */
        fixStage: text("fix_stage"),
        /** 修复阶段来源：maintainer / github / deterministic / ai。 */
        fixStageSource: text("fix_stage_source"),
        /** 修复证据状态：present / missing / contradicted。 */
        fixEvidenceStatus: text("fix_evidence_status"),
        /** 标签集合版本（乐观并发校验）。 */
        tagVersion: integer("tag_version").notNull().default(0),
        visibility: text("visibility").$type<BugVisibility>().notNull().default("public"),
        suggestedSeverity: text("suggested_severity").$type<BugSeverity>(),
        confirmedSeverity: text("confirmed_severity").$type<BugSeverity>(),
        /** 严重程度来源：ai / maintainer / deterministic。 */
        severitySource: text("severity_source"),
        /** 记录版本（管理动作的 expectedVersion）。 */
        version: integer("version").notNull().default(1),
        /** 归并目标；禁止成环，由领域层保证。 */
        duplicateOf: text("duplicate_of").references((): AnySQLiteColumn => bugs.id, { onDelete: "set null" }),
        fixedVersion: text("fixed_version"),
        createdAt: integer("created_at").$default(now),
    },
    table => [
        index("bugs_game_vis_status_cat_idx").on(table.gameId, table.visibility, table.status, table.primaryCategory),
        uniqueIndex("bugs_display_key_uq").on(table.displayKey),
        index("bugs_duplicate_of_idx").on(table.duplicateOf),
    ]
)

/** 证据关联：一个 Part 只能有一个当前归属，重复发帖不计多个受影响用户。 */
export const bugOccurrences = sqliteTable(
    "bug_occurrences",
    {
        id: text("id").$default(id).primaryKey(),
        bugId: text("bug_id")
            .notNull()
            .references(() => bugs.id, { onDelete: "cascade" }),
        submissionVersionId: text("submission_version_id").notNull(),
        partId: text("part_id").notNull(),
        evidenceRefs: text("evidence_refs", { mode: "json" }).$type<BugEvidenceRef[]>().notNull().default([]),
        reportedEnvironment: text("reported_environment", { mode: "json" }).$type<BugEnvironment>(),
        sourceActor: text("source_actor", { mode: "json" }).$type<BugActorRef>().notNull(),
        /** 该 Part 与 Bug 的归属关系：original / merged / reopened。 */
        relation: text("relation").notNull().default("original"),
        createdAt: integer("created_at").$default(now),
    },
    table => [
        uniqueIndex("bug_occurrences_version_part_uq").on(table.submissionVersionId, table.partId),
        index("bug_occurrences_bug_idx").on(table.bugId),
        index("bug_occurrences_version_idx").on(table.submissionVersionId),
    ]
)

/** 已有 Bug 上的再次反馈（文字与图片仍由 Submission 版本保存）。 */
export const bugFeedback = sqliteTable(
    "bug_feedback",
    {
        id: text("id").$default(id).primaryKey(),
        bugId: text("bug_id")
            .notNull()
            .references(() => bugs.id, { onDelete: "cascade" }),
        submissionVersionId: text("submission_version_id").notNull(),
        /** 反馈类型：evidence / reproduction / other。 */
        feedbackKind: text("feedback_kind").notNull(),
        reproductionResult: text("reproduction_result").$type<BugReproductionResult>(),
        gameVersion: text("game_version"),
        sourceActor: text("source_actor", { mode: "json" }).$type<BugActorRef>().notNull(),
        visibility: text("visibility").$type<BugVisibility>().notNull().default("public"),
        createdAt: integer("created_at").$default(now),
    },
    table => [index("bug_feedback_bug_idx").on(table.bugId), index("bug_feedback_version_idx").on(table.submissionVersionId)]
)

/** 讨论条目：本站与 GitHub 评论并存，来源与作者保留，不冒充另一平台账号。 */
export const bugDiscussionEntries = sqliteTable(
    "bug_discussion_entries",
    {
        id: text("id").$default(id).primaryKey(),
        bugId: text("bug_id")
            .notNull()
            .references(() => bugs.id, { onDelete: "cascade" }),
        source: text("source").$type<BugDiscussionSource>().notNull().default("local"),
        /** 来源侧作者标识：本站 userId / 匿名 actor / GitHub user ID。 */
        sourceActorId: text("source_actor_id"),
        /** 展示名（GitHub login 或用户公开昵称）。 */
        displayAuthor: text("display_author"),
        /** 安全投影后的正文，原站内容不能被本站用户编辑。 */
        bodySafe: text("body_safe").notNull(),
        revision: integer("revision").notNull().default(1),
        visibility: text("visibility").$type<BugVisibility>().notNull().default("public"),
        feedbackId: text("feedback_id").references(() => bugFeedback.id, { onDelete: "set null" }),
        deletedAt: integer("deleted_at"),
        /** 外发策略：仅 github_safe 的内容才能进入 GitHub。 */
        exportPolicy: text("export_policy").$type<BugPublicationPolicy>().notNull().default("internal_only"),
        createdAt: integer("created_at").$default(now),
    },
    table => [index("bug_discussion_bug_time_idx").on(table.bugId, table.createdAt, table.id)]
)

/** 投票意图：保留原始投票目标，合并/解除误合并时按用户集合恢复。 */
export const bugVoteIntents = sqliteTable(
    "bug_vote_intents",
    {
        userId: text("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        originalBugId: text("original_bug_id")
            .notNull()
            .references(() => bugs.id, { onDelete: "cascade" }),
        active: integer("active", { mode: "boolean" }).notNull().default(true),
        updatedAt: integer("updated_at").$default(now).$onUpdate(now),
    },
    table => [
        primaryKey({ columns: [table.userId, table.originalBugId] }),
        index("bug_vote_intents_bug_active_idx").on(table.originalBugId, table.active),
    ]
)

/** 关注订阅：登录账号或匿名回执范围。 */
export const bugSubscriptions = sqliteTable(
    "bug_subscriptions",
    {
        /** 身份键，如 `user:<id>` / `anon:<anonActorId>`。 */
        actorKey: text("actor_key").notNull(),
        bugId: text("bug_id")
            .notNull()
            .references(() => bugs.id, { onDelete: "cascade" }),
        channels: text("channels", { mode: "json" }).$type<string[]>().notNull().default([]),
        preferences: text("preferences", { mode: "json" }).$type<Record<string, unknown>>(),
        createdAt: integer("created_at").$default(now),
    },
    table => [primaryKey({ columns: [table.actorKey, table.bugId] })]
)

/** AI 运行记录：只留结构化结论与成本，不要求暴露隐藏思维链。 */
export const bugAiRuns = sqliteTable(
    "bug_ai_runs",
    {
        id: text("id").$default(id).primaryKey(),
        jobId: text("job_id").references(() => bugJobs.id, { onDelete: "set null" }),
        inputHash: text("input_hash").notNull(),
        modelProvider: text("model_provider"),
        harnessVersion: text("harness_version"),
        promptHash: text("prompt_hash"),
        toolManifestHash: text("tool_manifest_hash"),
        schemaVersion: integer("schema_version"),
        result: text("result", { mode: "json" }).$type<Record<string, unknown>>(),
        tokenUsage: text("token_usage", { mode: "json" }).$type<BugTokenUsage>(),
        costMicros: integer("cost_micros").notNull().default(0),
        startedAt: integer("started_at"),
        finishedAt: integer("finished_at"),
        error: text("error"),
    },
    table => [index("bug_ai_runs_job_idx").on(table.jobId), index("bug_ai_runs_input_hash_idx").on(table.inputHash)]
)

/** 可恢复的后台任务：租约 + fencingToken 保证旧 worker 不能提交过期结果。 */
export const bugJobs = sqliteTable(
    "bug_jobs",
    {
        id: text("id").$default(id).primaryKey(),
        /** 任务类型，如 `process_submission` / `sync_issue`。 */
        kind: text("kind").notNull(),
        inputRevision: integer("input_revision").notNull().default(0),
        idempotencyKey: text("idempotency_key").notNull(),
        state: text("state").$type<BugJobState>().notNull().default("queued"),
        /** 最早可领取时间（退避与调度窗口）。 */
        eligibleAt: integer("eligible_at").notNull().$default(now),
        priorityClass: text("priority_class").$type<BugJobPriority>().notNull().default("normal"),
        attempt: integer("attempt").notNull().default(0),
        leaseOwner: text("lease_owner"),
        leaseUntil: integer("lease_until"),
        /** 每次领取递增；提交结果必须匹配。 */
        fencingToken: integer("fencing_token").notNull().default(0),
        inputHash: text("input_hash"),
        /** 结果引用（Proposal id / run id 等）。 */
        resultRef: text("result_ref"),
        lastError: text("last_error"),
        createdAt: integer("created_at").$default(now),
    },
    table => [
        uniqueIndex("bug_jobs_idempotency_uq").on(table.idempotencyKey),
        index("bug_jobs_state_eligible_idx").on(table.state, table.eligibleAt, table.priorityClass),
        index("bug_jobs_lease_idx").on(table.leaseUntil),
    ]
)

/** 领域变更审计：与 outbox 同事务写入，一个事件只产生一次本地业务效果。 */
export const bugEvents = sqliteTable(
    "bug_events",
    {
        eventId: text("event_id").$default(id).primaryKey(),
        bugId: text("bug_id").references(() => bugs.id, { onDelete: "set null" }),
        submissionId: text("submission_id").references(() => bugSubmissions.id, { onDelete: "set null" }),
        kind: text("kind").notNull(),
        actor: text("actor", { mode: "json" }).$type<BugActorRef>(),
        payloadSafe: text("payload_safe", { mode: "json" }).$type<Record<string, unknown>>(),
        entityVersion: integer("entity_version"),
        createdAt: integer("created_at").$default(now),
    },
    table => [
        index("bug_events_bug_idx").on(table.bugId),
        index("bug_events_submission_idx").on(table.submissionId),
        index("bug_events_kind_idx").on(table.kind),
        index("bug_events_created_idx").on(table.createdAt),
    ]
)

/** 归并日志：保留可解除误合并的关系历史与迁移证据。 */
export const bugMergeEvents = sqliteTable(
    "bug_merge_events",
    {
        id: text("id").$default(id).primaryKey(),
        sourceBugIds: text("source_bug_ids", { mode: "json" }).$type<string[]>().notNull().default([]),
        targetBugId: text("target_bug_id")
            .notNull()
            .references(() => bugs.id, { onDelete: "cascade" }),
        decisionEvidence: text("decision_evidence", { mode: "json" }).$type<Record<string, unknown>>(),
        /** 归并前各 Bug 的 version 快照，解除时校验。 */
        beforeVersions: text("before_versions", { mode: "json" }).$type<Record<string, number>>(),
        movedOccurrenceIds: text("moved_occurrence_ids", { mode: "json" }).$type<string[]>().notNull().default([]),
        actor: text("actor", { mode: "json" }).$type<BugActorRef>(),
        revertedAt: integer("reverted_at"),
        createdAt: integer("created_at").$default(now),
    },
    table => [index("bug_merge_events_target_idx").on(table.targetBugId), index("bug_merge_events_reverted_idx").on(table.revertedAt)]
)

/** 站内关联：带类型、方向与证据，关联不等于归并。 */
export const bugRelations = sqliteTable(
    "bug_relations",
    {
        id: text("id").$default(id).primaryKey(),
        sourceBugId: text("source_bug_id")
            .notNull()
            .references(() => bugs.id, { onDelete: "cascade" }),
        targetBugId: text("target_bug_id")
            .notNull()
            .references(() => bugs.id, { onDelete: "cascade" }),
        relationType: text("relation_type").$type<BugRelationType>().notNull(),
        /** 对称关系的规范键（排序后的 pair + 类型），方向关系为空。 */
        symmetryKey: text("symmetry_key"),
        evidenceRefs: text("evidence_refs", { mode: "json" }).$type<BugEvidenceRef[]>().notNull().default([]),
        /** 关系来源：ai / maintainer / user / system。 */
        origin: text("origin").notNull().default("user"),
        actor: text("actor", { mode: "json" }).$type<BugActorRef>(),
        revision: integer("revision").notNull().default(1),
        visibility: text("visibility").$type<BugVisibility>().notNull().default("public"),
        /** 关系状态：active / removed。 */
        state: text("state").notNull().default("active"),
        deletedAt: integer("deleted_at"),
        createdAt: integer("created_at").$default(now),
    },
    table => [
        uniqueIndex("bug_relations_symmetry_uq").on(table.symmetryKey).where(sql`${table.symmetryKey} is not null`),
        index("bug_relations_pair_idx").on(table.sourceBugId, table.targetBugId, table.relationType, table.state),
        index("bug_relations_target_idx").on(table.targetBugId, table.relationType, table.state),
    ]
)

/** 标签语义字典：tagKey 稳定，显示名与 GitHub label 只是绑定。 */
export const bugTagDefinitions = sqliteTable("bug_tag_definitions", {
    tagKey: text("tag_key").primaryKey(),
    /** 命名空间：fix / category / severity / platform / region / env。 */
    namespace: text("namespace").notNull(),
    /** 互斥组，如 `fix_stage`；组内只能有一个有效标签。 */
    exclusiveGroup: text("exclusive_group"),
    /** 六语言文案的 i18n key。 */
    displayI18nKey: text("display_i18n_key").notNull(),
    semanticDescription: text("semantic_description"),
    /** 允许发起该标签的来源（ai / maintainer / github / system）。 */
    allowedSources: text("allowed_sources", { mode: "json" }).$type<string[]>().notNull().default([]),
    /** 证据要求说明（如 fix.released 需要版本或验证证据）。 */
    evidencePolicy: text("evidence_policy"),
    registryVersion: integer("registry_version").notNull().default(1),
    retiredAt: integer("retired_at"),
})

/** 标签赋值历史：removedAt 为空表示当前生效。 */
export const bugTagAssignments = sqliteTable(
    "bug_tag_assignments",
    {
        bugId: text("bug_id")
            .notNull()
            .references(() => bugs.id, { onDelete: "cascade" }),
        tagKey: text("tag_key")
            .notNull()
            .references(() => bugTagDefinitions.tagKey, { onDelete: "cascade" }),
        /** 标签来源：maintainer / github / ai / system。 */
        source: text("source").notNull(),
        actor: text("actor", { mode: "json" }).$type<BugActorRef>(),
        evidenceRefs: text("evidence_refs", { mode: "json" }).$type<BugEvidenceRef[]>().notNull().default([]),
        /** 所属 Bug 的记录版本。 */
        entityVersion: integer("entity_version").notNull().default(1),
        eventId: text("event_id"),
        removedAt: integer("removed_at"),
        createdAt: integer("created_at").$default(now),
    },
    table => [
        index("bug_tag_assignments_bug_tag_idx").on(table.bugId, table.tagKey, table.removedAt),
        index("bug_tag_assignments_tag_idx").on(table.tagKey),
    ]
)

/** Bug ↔ GitHub Issue 的持久映射；未知外部枚举保留原值。 */
export const githubIssueLinks = sqliteTable(
    "github_issue_links",
    {
        id: text("id").$default(id).primaryKey(),
        bugId: text("bug_id")
            .notNull()
            .references(() => bugs.id, { onDelete: "cascade" }),
        repositoryId: text("repository_id").notNull(),
        /** GitHub Issue 数据库 id（不是 number）。 */
        issueId: text("issue_id").notNull(),
        issueNodeId: text("issue_node_id"),
        issueNumber: integer("issue_number").notNull(),
        htmlUrl: text("html_url").notNull(),
        role: text("role").$type<GithubIssueLinkRole>().notNull().default("primary"),
        /** 同步状态：synced / pending / conflict / blocked / failed。 */
        syncState: text("sync_state").notNull().default("pending"),
        remoteUpdatedAt: integer("remote_updated_at"),
        remoteState: text("remote_state"),
        remoteStateReason: text("remote_state_reason"),
        /** 外部 duplicate 目标（未验证前不据此强合并）。 */
        remoteDuplicateTarget: text("remote_duplicate_target"),
        createdAt: integer("created_at").$default(now),
    },
    table => [
        uniqueIndex("github_issue_links_primary_uq").on(table.bugId, table.repositoryId).where(sql`${table.role} = 'primary'`),
        index("github_issue_links_repo_issue_idx").on(table.repositoryId, table.issueId),
        index("github_issue_links_bug_role_idx").on(table.bugId, table.role),
    ]
)

/** 讨论条目 ↔ GitHub 评论的镜像映射。 */
export const githubCommentLinks = sqliteTable(
    "github_comment_links",
    {
        discussionEntryId: text("discussion_entry_id")
            .notNull()
            .references(() => bugDiscussionEntries.id, { onDelete: "cascade" }),
        repositoryId: text("repository_id").notNull(),
        issueId: text("issue_id").notNull(),
        commentId: text("comment_id").notNull(),
        /** 评论来源：local / github。 */
        sourceOrigin: text("source_origin").notNull(),
        lastLocalRevision: integer("last_local_revision"),
        lastRemoteHash: text("last_remote_hash"),
        deletedAt: integer("deleted_at"),
    },
    table => [
        uniqueIndex("github_comment_links_repo_comment_uq").on(table.repositoryId, table.commentId),
        index("github_comment_links_entry_idx").on(table.discussionEntryId),
    ]
)

/** GitHub label 与 tagKey 的正式绑定；改 label 名不自动改变语义。 */
export const githubLabelBindings = sqliteTable(
    "github_label_bindings",
    {
        repositoryId: text("repository_id").notNull(),
        labelName: text("label_name").notNull(),
        tagKey: text("tag_key")
            .notNull()
            .references(() => bugTagDefinitions.tagKey, { onDelete: "cascade" }),
        registryVersion: integer("registry_version").notNull().default(1),
        /** 绑定状态：active / conflict / paused / retired。 */
        state: text("state").notNull().default("active"),
    },
    table => [primaryKey({ columns: [table.repositoryId, table.labelName] }), index("github_label_bindings_tag_idx").on(table.tagKey)]
)

/** 每个 IssueLink × 标签组的同步基线，用于增删与并发对账。 */
export const githubTagSyncState = sqliteTable(
    "github_tag_sync_state",
    {
        issueLinkId: text("issue_link_id")
            .notNull()
            .references(() => githubIssueLinks.id, { onDelete: "cascade" }),
        /** 标签组键（互斥组名或单标签 namespace）。 */
        groupKey: text("group_key").notNull(),
        lastSyncedTagKeys: text("last_synced_tag_keys", { mode: "json" }).$type<string[]>().notNull().default([]),
        localTagVersion: integer("local_tag_version").notNull().default(0),
        pendingEventId: text("pending_event_id"),
        conflict: integer("conflict", { mode: "boolean" }).notNull().default(false),
        verifiedAt: integer("verified_at"),
    },
    table => [primaryKey({ columns: [table.issueLinkId, table.groupKey] })]
)

/** Webhook Inbox：验签后先持久化再 ACK，重复 delivery 不重复产生业务效果。 */
export const githubWebhookInbox = sqliteTable(
    "github_webhook_inbox",
    {
        deliveryId: text("delivery_id").primaryKey(),
        event: text("event").notNull(),
        action: text("action"),
        repositoryId: text("repository_id"),
        installationId: text("installation_id"),
        /** 原始 payload（私有，含 GitHub 作者信息），不对公开接口输出。 */
        payloadPrivate: text("payload_private").notNull(),
        processingState: text("processing_state").$type<BugInboxState>().notNull().default("pending"),
        attempt: integer("attempt").notNull().default(0),
        receivedAt: integer("received_at").notNull().$default(now),
        lastError: text("last_error"),
    },
    table => [index("github_webhook_inbox_state_idx").on(table.processingState, table.receivedAt)]
)

/** 出站操作：本地事务写事件 + outbox，GitHub 写入结果单独记录。 */
export const bugOutbox = sqliteTable(
    "bug_outbox",
    {
        eventId: text("event_id").notNull(),
        /** 操作名，如 `create_issue` / `comment` / `label_add`。 */
        operation: text("operation").notNull(),
        /** 目标映射键（repositoryId 等）。 */
        targetMapping: text("target_mapping").notNull(),
        sourceRevision: integer("source_revision"),
        payloadHash: text("payload_hash"),
        state: text("state").$type<BugOutboxState>().notNull().default("queued"),
        attempt: integer("attempt").notNull().default(0),
        nextAttemptAt: integer("next_attempt_at"),
        remoteResult: text("remote_result", { mode: "json" }).$type<Record<string, unknown>>(),
        lastError: text("last_error"),
        createdAt: integer("created_at").$default(now),
    },
    table => [
        uniqueIndex("bug_outbox_event_operation_target_uq").on(table.eventId, table.operation, table.targetMapping),
        index("bug_outbox_state_next_idx").on(table.state, table.nextAttemptAt),
    ]
)

/** Bug 与内联表的关系：GQL 查询用 `with` 一次取回，避免多次查询手动拼接。 */
export const bugsRelations = relations(bugs, ({ many }) => ({
    issueLinks: many(githubIssueLinks),
    occurrences: many(bugOccurrences),
    events: many(bugEvents),
}))

export const githubIssueLinksRelations = relations(githubIssueLinks, ({ one }) => ({
    bug: one(bugs, { fields: [githubIssueLinks.bugId], references: [bugs.id] }),
}))

export const bugOccurrencesRelations = relations(bugOccurrences, ({ one }) => ({
    bug: one(bugs, { fields: [bugOccurrences.bugId], references: [bugs.id] }),
}))

export const bugEventsRelations = relations(bugEvents, ({ one }) => ({
    bug: one(bugs, { fields: [bugEvents.bugId], references: [bugs.id] }),
}))
