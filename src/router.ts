import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window"
import { createRouter, createWebHashHistory, createWebHistory, type RouteRecordRaw } from "vue-router"
import { env } from "./env"
import AchievementList from "./views/AchievementList.vue"
import CharBuildCompare from "./views/CharBuildCompare.vue"
import CharBuildView from "./views/CharBuildView.vue"
import CharListView from "./views/CharListView.vue"
import GuideDetailView from "./views/GuideDetailView.vue"
import GuideEditView from "./views/GuideEditView.vue"
import GuideListView from "./views/GuideListView.vue"
import Home from "./views/Home.vue"
import InventoryEdit from "./views/InventoryEdit.vue"
import More from "./views/More.vue"
import NotFound from "./views/NotFound.vue"
import Setting from "./views/Setting.vue"
import TimelineEditor from "./views/TimelineEditor.vue"
import UserManager from "./views/UserManager.vue"

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
    { name: "char-build-code", path: "/char/:charId/:buildId", component: CharBuildView, beforeEnter: () => setMinSize(360, 600) },
    { name: "build-share", path: "/build/:buildId", component: CharBuildView, beforeEnter: () => setMinSize(360, 600) },
    { name: "timeline-share", path: "/timeline/:timelineId", component: TimelineEditor, beforeEnter: () => setMinSize(600, 600) },
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
    { name: "game-accounts", path: "/game-accounts", component: UserManager, beforeEnter: () => setMinSize(600, 600) },
    {
        name: "more",
        path: "/more",
        component: More,
        beforeEnter: () => setMinSize(600, 600),
    },
    {
        name: "flow",
        path: "/flow",
        component: () => import("./views/FlowBuildView.vue"),
        beforeEnter: () => setMinSize(900, 700),
    },
    // more: lazy load
    {
        name: "dps",
        path: "/dps",
        component: () => import("./views/CharDPSView.vue"),
        beforeEnter: () => setMinSize(600, 600),
    },
    {
        name: "levelup",
        path: "/levelup",
        component: () => import("./views/LevelUpCalculatorView.vue"),
        beforeEnter: () => setMinSize(600, 600),
    },
    { name: "ai", path: "/ai", component: () => import("./views/AIAgent.vue"), beforeEnter: () => setMinSize(600, 600) },
    { name: "help", path: "/help", component: () => import("./views/Help.vue"), beforeEnter: () => setMinSize(800, 700) },
    {
        name: "chat",
        path: "/chat",
        component: () => import("./views/Chat.vue"),
        beforeEnter: () => setMinSize(367, 430),
        meta: { keepAlive: true },
        children: [
            { name: "room", path: ":room", component: () => import("./views/ChatRoom.vue") }, //
        ],
    },
    // admin
    {
        path: "/admin",
        component: () => import("./admin/AdminLayout.vue"),
        beforeEnter: () => setMinSize(600, 600),
        children: [
            {
                name: "admin-home",
                path: "",
                component: () => import("./admin/AdminHome.vue"),
            },
            {
                name: "admin-user",
                path: "user",
                component: () => import("./admin/UserManagement.vue"),
            },
            {
                name: "admin-guide",
                path: "guide",
                component: () => import("./admin/GuideManagement.vue"),
            },
            {
                name: "admin-room",
                path: "room",
                component: () => import("./admin/RoomManagement.vue"),
            },
            {
                name: "admin-todo",
                path: "todo",
                component: () => import("./admin/TodoManagement.vue"),
            },
            {
                name: "admin-build",
                path: "build",
                component: () => import("./admin/BuildManagement.vue"),
            },
            {
                name: "admin-timeline",
                path: "timeline",
                component: () => import("./admin/TimelineManagement.vue"),
            },
        ],
    },
    // 数据库路由
    {
        name: "database",
        path: "/db",
        component: () => import("./views/DBView.vue"),
        beforeEnter: () => setMinSize(320, 360),
    },
    {
        name: "walnut-list",
        path: "/db/walnut",
        component: () => import("./views/DBWalnutListView.vue"),
        beforeEnter: () => setMinSize(320, 360),
    },
    {
        name: "walnut-detail",
        path: "/db/walnut/:id",
        component: () => import("./views/DBWalnutDetailView.vue"),
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
    {
        name: "abyss-dungeon-list",
        path: "/db/abyss",
        component: () => import("./views/DBAbyssDungeonListView.vue"),
        beforeEnter: () => setMinSize(320, 360),
    },
    {
        name: "abyss-dungeon-detail",
        path: "/db/abyss/:dungeonId",
        component: () => import("./views/DBAbyssDungeonDetailView.vue"),
        beforeEnter: () => setMinSize(320, 360),
    },
    {
        name: "pet-list",
        path: "/db/pet",
        component: () => import("./views/DBPetListView.vue"),
        beforeEnter: () => setMinSize(320, 360),
    },
    {
        name: "pet-detail",
        path: "/db/pet/:id",
        component: () => import("./views/DBPetDetailView.vue"),
        beforeEnter: () => setMinSize(320, 360),
    },
    {
        name: "fish-list",
        path: "/db/fish",
        component: () => import("./views/DBFishListView.vue"),
        beforeEnter: () => setMinSize(320, 360),
    },
    {
        name: "fish-detail",
        path: "/db/fish/:id",
        component: () => import("./views/DBFishDetailView.vue"),
        beforeEnter: () => setMinSize(320, 360),
    },
    {
        name: "map-list",
        path: "/db/map",
        component: () => import("./views/DBMapListView.vue"),
        beforeEnter: () => setMinSize(320, 360),
    },
    {
        name: "map-detail",
        path: "/db/map/:mapId",
        component: () => import("./views/DBMapDetailView.vue"),
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

    // 攻略 routes
    { name: "guide-list", path: "/guides", component: GuideListView, beforeEnter: () => setMinSize(800, 600) },
    { name: "guide-detail", path: "/guides/:id", component: GuideDetailView, beforeEnter: () => setMinSize(800, 600) },
    { name: "guide-create", path: "/guides/create", component: GuideEditView, beforeEnter: () => setMinSize(800, 800) },
    { name: "guide-edit", path: "/guides/:id/edit", component: GuideEditView, beforeEnter: () => setMinSize(800, 800) },

    // 404 页面 - 必须放在最后作为捕获所有未匹配路由
    { path: "/:pathMatch(.*)*", name: "notfound", component: NotFound, beforeEnter: () => setMinSize(360, 430) },
]

export const router = createRouter({
    // 应用内使用 hash 模式，其他环境使用 history 模式
    history: env.isApp ? createWebHashHistory() : createWebHistory(),
    routes,
})
