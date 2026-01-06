import { RouteRecordRaw, createWebHashHistory, createRouter, createWebHistory } from "vue-router"

import Home from "./views/Home.vue"
import Setting from "./views/Setting.vue"
import CharBuildView from "./views/CharBuildView.vue"
import CharBuildCompare from "./views/CharBuildCompare.vue"
import InventoryEdit from "./views/InventoryEdit.vue"
import More from "./views/More.vue"
import TimelineEditor from "./views/TimelineEditor.vue"
import AchievementList from "./views/AchievementList.vue"
import { env } from "./env"
import { LogicalSize, getCurrentWindow } from "@tauri-apps/api/window"
import UserManager from "./views/UserManager.vue"
import CharListView from "./views/CharListView.vue"

let setMinSize = async (_w: number, _h: number) => {}
;(async () => {
    if (!env.isApp) return
    setMinSize = async (w: number, h: number) => {
        const win = getCurrentWindow()
        if (!(await win.isMaximized())) win.setMinSize(new LogicalSize(w, h))
    }
})()

const routes: readonly RouteRecordRaw[] = [
    { name: "home", path: "/", component: Home, beforeEnter: () => setMinSize(360, 430) },
    { name: "setting", path: "/setting", component: Setting, beforeEnter: () => setMinSize(540, 430) },
    { name: "char-list", path: "/char", component: CharListView, beforeEnter: () => setMinSize(600, 600) },
    { name: "char-build", path: "/char/:charId", component: CharBuildView, beforeEnter: () => setMinSize(360, 600) },
    { name: "char-build-code", path: "/char/:charId/:code", component: CharBuildView, beforeEnter: () => setMinSize(360, 600) },
    { name: "build-compare", path: "/char-build-compare", component: CharBuildCompare, beforeEnter: () => setMinSize(600, 600) },
    { name: "inventory", path: "/inventory", component: InventoryEdit, beforeEnter: () => setMinSize(600, 600) },
    { name: "timeline", path: "/timeline", component: TimelineEditor, beforeEnter: () => setMinSize(600, 600) },
    { name: "achievement", path: "/achievement", component: AchievementList, beforeEnter: () => setMinSize(600, 600) },
    {
        name: "game-launcher",
        path: "/game-launcher",
        component: env.isApp ? () => import("./views/GameLauncher.vue") : () => undefined,
        beforeEnter: () => setMinSize(800, 700),
    },
    { name: "login", path: "/login", component: UserManager, beforeEnter: () => setMinSize(600, 600) },
    { name: "more", path: "/more", component: More, beforeEnter: () => setMinSize(600, 600) },
    // more: lazy load
    { name: "ai", path: "/ai", component: () => import("./views/AIAgent.vue"), beforeEnter: () => setMinSize(600, 600) },
    { name: "help", path: "/help", component: () => import("./views/Help.vue"), beforeEnter: () => setMinSize(800, 700) },

    // 数据库路由
    {
        name: "database",
        path: "/db",
        component: () => import("./views/DBView.vue"),
        beforeEnter: () => setMinSize(320, 360),
    },
    {
        name: "raid-rank",
        path: "/db/rank",
        component: () => import("./views/DBRaidRank.vue"),
        beforeEnter: () => setMinSize(320, 360),
    },
    {
        name: "mod-list",
        path: "/db/mod",
        component: () => import("./views/DBModListView.vue"),
        beforeEnter: () => setMinSize(320, 360),
    },
    {
        name: "mod-detail",
        path: "/db/mod/:id",
        component: () => import("./views/DBModDetailView.vue"),
        beforeEnter: () => setMinSize(320, 360),
    },
    {
        name: "draft-list",
        path: "/db/draft",
        component: () => import("./views/DBDraftListView.vue"),
        beforeEnter: () => setMinSize(320, 360),
    },
    {
        name: "draft-detail",
        path: "/db/draft/:id",
        component: () => import("./views/DBDraftDetailView.vue"),
        beforeEnter: () => setMinSize(320, 360),
    },
    {
        name: "monster-list",
        path: "/db/monster",
        component: () => import("./views/DBMonsterListView.vue"),
        beforeEnter: () => setMinSize(320, 360),
    },
    {
        name: "monster-detail",
        path: "/db/monster/:monsterId",
        component: () => import("./views/DBMonsterDetailView.vue"),
        beforeEnter: () => setMinSize(320, 360),
    },
    {
        name: "weapon-list",
        path: "/db/weapon",
        component: () => import("./views/DBWeaponListView.vue"),
        beforeEnter: () => setMinSize(320, 360),
    },
    {
        name: "weapon-detail",
        path: "/db/weapon/:id",
        component: () => import("./views/DBWeaponDetailView.vue"),
        beforeEnter: () => setMinSize(320, 360),
    },
    {
        name: "dungeon-list",
        path: "/db/dungeon",
        component: () => import("./views/DBDungeonListView.vue"),
        beforeEnter: () => setMinSize(320, 360),
    },
    {
        name: "dungeon-detail",
        path: "/db/dungeon/:dungeonId",
        component: () => import("./views/DBDungeonDetailView.vue"),
        beforeEnter: () => setMinSize(320, 360),
    },

    // DNA routes
    { name: "dna-home", path: "/dna", component: () => import("./views/DNAHomeView.vue"), beforeEnter: () => setMinSize(600, 600) },
    {
        name: "dna-role-detail",
        path: "/dna/char/:charId/:charEid",
        component: () => import("./views/DNARoleDetailView.vue"),
        beforeEnter: () => setMinSize(600, 600),
    },
    {
        name: "dna-weapon-detail",
        path: "/dna/weapon/:weaponId/:weaponEid",
        component: () => import("./views/DNAWeaponDetailView.vue"),
        beforeEnter: () => setMinSize(600, 600),
    },
    {
        name: "dna-user",
        path: "/dna/mine",
        component: () => import("./views/DNAUserMineView.vue"),
        beforeEnter: () => setMinSize(600, 600),
    },
    {
        name: "dna-user",
        path: "/dna/mine/:userId",
        component: () => import("./views/DNAUserMineView.vue"),
        beforeEnter: () => setMinSize(600, 600),
    },
    {
        name: "dna-posts",
        path: "/dna/posts/:forumId",
        component: () => import("./views/DNAPostListView.vue"),
        beforeEnter: () => setMinSize(600, 600),
    },
    {
        name: "dna-topic",
        path: "/dna/topic/:topicId",
        component: () => import("./views/DNAPostListView.vue"),
        beforeEnter: () => setMinSize(600, 600),
    },
    {
        name: "dna-post-detail",
        path: "/dna/posts/:forumId/:postId",
        component: () => import("./views/DNAPostDetailView.vue"),
        beforeEnter: () => setMinSize(600, 600),
    },
]

export const router = createRouter({
    // edgeone.dev 域名下使用 history 模式，其他域名下使用 hash 模式
    history:
        location.host.endsWith("edgeone.dev") || location.host.endsWith("xn--chq26veyq.icu") ? createWebHistory() : createWebHashHistory(),
    routes,
})
