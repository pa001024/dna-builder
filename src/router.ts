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
    {
        path: "/char",
        children: [
            { name: "char-build-list", path: "", component: CharListView, beforeEnter: () => setMinSize(600, 600) },
            { name: "char-build", path: ":charId", component: CharBuildView, beforeEnter: () => setMinSize(360, 600) },
            { name: "char-build-code", path: ":charId/:buildId", component: CharBuildView, beforeEnter: () => setMinSize(360, 600) },
        ],
    },
    { name: "build-compare", path: "/char-build-compare", component: CharBuildCompare, beforeEnter: () => setMinSize(600, 600) },
    {
        path: "/timeline",
        children: [
            { name: "timeline", path: "", component: TimelineEditor, beforeEnter: () => setMinSize(600, 600) },
            { name: "timeline-share", path: ":timelineId", component: TimelineEditor, beforeEnter: () => setMinSize(600, 600) },
        ],
    },
    { name: "inventory", path: "/inventory", component: InventoryEdit, beforeEnter: () => setMinSize(600, 600) },
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
            {
                name: "admin-script",
                path: "script",
                component: () => import("./admin/ScriptManagement.vue"),
            },
        ],
    },
    // 资料库路由
    {
        path: "/db",
        children: [
            {
                name: "database",
                path: "",
                component: () => import("./views/DBView.vue"),
                beforeEnter: () => setMinSize(320, 360),
            },
            {
                name: "db-damage",
                path: "damage",
                component: () => import("./views/DBDamageView.vue"),
                beforeEnter: () => setMinSize(800, 700),
            },
            {
                name: "walnut-list",
                path: "walnut",
                component: () => import("./views/DBWalnutListView.vue"),
                beforeEnter: () => setMinSize(320, 360),
            },
            {
                name: "walnut-detail",
                path: "walnut/:id",
                component: () => import("./views/DBWalnutDetailView.vue"),
                beforeEnter: () => setMinSize(320, 360),
            },
            {
                name: "title-list",
                path: "title",
                component: () => import("./views/DBTitleListView.vue"),
                beforeEnter: () => setMinSize(320, 360),
            },
            {
                name: "title-detail",
                path: "title/:id",
                component: () => import("./views/DBTitleDetailView.vue"),
                beforeEnter: () => setMinSize(320, 360),
            },
            {
                name: "book-list",
                path: "book",
                component: () => import("./views/DBBookListView.vue"),
                beforeEnter: () => setMinSize(600, 600),
            },
            {
                name: "book-detail",
                path: "book/:id",
                component: () => import("./views/DBBookDetailView.vue"),
                beforeEnter: () => setMinSize(600, 600),
            },
            {
                name: "raid-rank",
                path: "rank",
                component: () => import("./views/DBRaidRank.vue"),
                beforeEnter: () => setMinSize(320, 360),
            },
            {
                name: "mod-list",
                path: "mod",
                component: () => import("./views/DBModListView.vue"),
                beforeEnter: () => setMinSize(320, 360),
            },
            {
                name: "mod-detail",
                path: "mod/:id",
                component: () => import("./views/DBModDetailView.vue"),
                beforeEnter: () => setMinSize(320, 360),
            },
            {
                name: "char-list",
                path: "char",
                component: () => import("./views/DBCharListView.vue"),
                beforeEnter: () => setMinSize(320, 360),
            },
            {
                name: "char-detail",
                path: "char/:id",
                component: () => import("./views/DBCharDetailView.vue"),
                beforeEnter: () => setMinSize(320, 360),
            },
            {
                name: "draft-list",
                path: "draft",
                component: () => import("./views/DBDraftListView.vue"),
                beforeEnter: () => setMinSize(320, 360),
            },
            {
                name: "draft-detail",
                path: "draft/:id",
                component: () => import("./views/DBDraftDetailView.vue"),
                beforeEnter: () => setMinSize(320, 360),
            },
            {
                name: "monster-list",
                path: "monster",
                component: () => import("./views/DBMonsterListView.vue"),
                beforeEnter: () => setMinSize(320, 360),
            },
            {
                name: "monster-detail",
                path: "monster/:monsterId",
                component: () => import("./views/DBMonsterDetailView.vue"),
                beforeEnter: () => setMinSize(320, 360),
            },
            {
                name: "monster-tag-detail",
                path: "monstertag/:monsterTagId",
                component: () => import("./views/DBMonsterTagDetailView.vue"),
                beforeEnter: () => setMinSize(320, 360),
            },
            {
                name: "weapon-list",
                path: "weapon",
                component: () => import("./views/DBWeaponListView.vue"),
                beforeEnter: () => setMinSize(320, 360),
            },
            {
                name: "weapon-detail",
                path: "weapon/:id",
                component: () => import("./views/DBWeaponDetailView.vue"),
                beforeEnter: () => setMinSize(320, 360),
            },
            {
                name: "accessory-list",
                path: "accessory",
                component: () => import("./views/DBAccessoryListView.vue"),
                beforeEnter: () => setMinSize(320, 360),
            },
            {
                name: "accessory-detail",
                path: "accessory/:accessoryType/:accessoryId",
                component: () => import("./views/DBAccessoryDetailView.vue"),
                beforeEnter: () => setMinSize(320, 360),
            },
            {
                name: "dungeon-list",
                path: "dungeon",
                component: () => import("./views/DBDungeonListView.vue"),
                beforeEnter: () => setMinSize(320, 360),
            },
            {
                name: "dungeon-detail",
                path: "dungeon/:dungeonId",
                component: () => import("./views/DBDungeonDetailView.vue"),
                beforeEnter: () => setMinSize(320, 360),
            },
            {
                name: "reputation-list",
                path: "reputation",
                component: () => import("./views/DBReputationListView.vue"),
                beforeEnter: () => setMinSize(320, 360),
            },
            {
                name: "reputation-detail",
                path: "reputation/:reputationId",
                component: () => import("./views/DBReputationDetailView.vue"),
                beforeEnter: () => setMinSize(320, 360),
            },
            {
                name: "abyss-dungeon-list",
                path: "abyss",
                component: () => import("./views/DBAbyssDungeonListView.vue"),
                beforeEnter: () => setMinSize(320, 360),
            },
            {
                name: "abyss-dungeon-detail",
                path: "abyss/:dungeonId",
                component: () => import("./views/DBAbyssDungeonDetailView.vue"),
                beforeEnter: () => setMinSize(320, 360),
            },
            {
                name: "pet-list",
                path: "pet",
                component: () => import("./views/DBPetListView.vue"),
                beforeEnter: () => setMinSize(320, 360),
            },
            {
                name: "pet-detail",
                path: "pet/:id",
                component: () => import("./views/DBPetDetailView.vue"),
                beforeEnter: () => setMinSize(320, 360),
            },
            {
                name: "fish-list",
                path: "fish",
                component: () => import("./views/DBFishListView.vue"),
                beforeEnter: () => setMinSize(320, 360),
            },
            {
                name: "fish-spot-detail",
                path: "fishspot/:id",
                component: () => import("./views/DBFishSpotDetailView.vue"),
                beforeEnter: () => setMinSize(320, 360),
            },
            {
                name: "fish-detail",
                path: "fish/:id",
                component: () => import("./views/DBFishDetailView.vue"),
                beforeEnter: () => setMinSize(320, 360),
            },
            {
                name: "map-list",
                path: "map",
                component: () => import("./views/DBMapListView.vue"),
                beforeEnter: () => setMinSize(320, 360),
            },
            {
                name: "map-local",
                path: "map-local",
                component: () => import("./views/DBMapLocalView.vue"),
                beforeEnter: () => setMinSize(600, 600),
            },
            {
                name: "map-detail",
                path: "map/:mapId",
                component: () => import("./views/DBMapDetailView.vue"),
                beforeEnter: () => setMinSize(320, 360),
            },
            {
                name: "shop-list",
                path: "shop",
                component: () => import("./views/DBShopListView.vue"),
                beforeEnter: () => setMinSize(320, 360),
            },
            {
                name: "shop-detail",
                path: "shop/:shopId/:subTabId?",
                component: () => import("./views/DBShopDetailView.vue"),
                beforeEnter: () => setMinSize(320, 360),
            },
            {
                name: "hardboss-list",
                path: "hardboss",
                component: () => import("./views/DBHardbossListView.vue"),
                beforeEnter: () => setMinSize(600, 600),
            },
            {
                name: "hardboss-detail",
                path: "hardboss/:bossId",
                component: () => import("./views/DBHardbossDetailView.vue"),
                beforeEnter: () => setMinSize(600, 600),
            },
            {
                name: "dynquest-list",
                path: "dynquest",
                component: () => import("./views/DBDynQuestListView.vue"),
                beforeEnter: () => setMinSize(600, 600),
            },
            {
                name: "dynquest-detail",
                path: "dynquest/:questId",
                component: () => import("./views/DBDynQuestDetailView.vue"),
                beforeEnter: () => setMinSize(600, 600),
            },
            {
                name: "partytopic-list",
                path: "partytopic",
                component: () => import("./views/DBPartyTopicListView.vue"),
                beforeEnter: () => setMinSize(600, 600),
            },
            {
                name: "partytopic-detail",
                path: "partytopic/:partyTopicId",
                component: () => import("./views/DBPartyTopicDetailView.vue"),
                beforeEnter: () => setMinSize(600, 600),
            },
            {
                name: "questchain-list",
                path: "questchain",
                component: () => import("./views/DBQuestChainListView.vue"),
                beforeEnter: () => setMinSize(600, 600),
            },
            {
                name: "questchain-detail",
                path: "questchain/:questChainId",
                component: () => import("./views/DBQuestDetailView.vue"),
                beforeEnter: () => setMinSize(600, 600),
            },
            {
                name: "achievement-list",
                path: "achievement",
                component: () => import("./views/DBAchievementListView.vue"),
                beforeEnter: () => setMinSize(600, 600),
            },
            {
                name: "achievement-detail",
                path: "achievement/:id",
                component: () => import("./views/DBAchievementDetailView.vue"),
                beforeEnter: () => setMinSize(600, 600),
            },
            {
                name: "npc-list",
                path: "npc",
                component: () => import("./views/DBNpcListView.vue"),
                beforeEnter: () => setMinSize(600, 600),
                meta: { keepAlive: true },
            },
            {
                name: "npc-detail",
                path: "npc/:npcId",
                component: () => import("./views/DBNpcDetailView.vue"),
                beforeEnter: () => setMinSize(600, 600),
            },
        ],
    },
    // DNA routes
    {
        path: "/dna",
        children: [
            { name: "dna-home", path: "/dna", component: () => import("./views/DNAHomeView.vue"), beforeEnter: () => setMinSize(600, 600) },
            {
                name: "dna-role-detail",
                path: "char/:charId/:charEid",
                component: () => import("./views/DNARoleDetailView.vue"),
                beforeEnter: () => setMinSize(600, 600),
            },
            {
                name: "dna-weapon-detail",
                path: "weapon/:weaponId/:weaponEid",
                component: () => import("./views/DNAWeaponDetailView.vue"),
                beforeEnter: () => setMinSize(600, 600),
            },
            {
                name: "dna-mine",
                path: "mine",
                component: () => import("./views/DNAUserMineView.vue"),
                beforeEnter: () => setMinSize(600, 600),
            },
            {
                name: "dna-user",
                path: "mine/:userId",
                component: () => import("./views/DNAUserMineView.vue"),
                beforeEnter: () => setMinSize(600, 600),
            },
            {
                name: "dna-posts",
                path: "posts/:forumId",
                component: () => import("./views/DNAPostListView.vue"),
                beforeEnter: () => setMinSize(600, 600),
            },
            {
                name: "dna-topic",
                path: "topic/:topicId",
                component: () => import("./views/DNAPostListView.vue"),
                beforeEnter: () => setMinSize(600, 600),
            },
            {
                name: "dna-post-detail",
                path: "posts/:forumId/:postId",
                component: () => import("./views/DNAPostDetailView.vue"),
                beforeEnter: () => setMinSize(600, 600),
            },
        ],
    },

    // 攻略 routes
    { name: "guide-list", path: "/guides", component: GuideListView, beforeEnter: () => setMinSize(800, 600) },
    { name: "guide-detail", path: "/guides/:id", component: GuideDetailView, beforeEnter: () => setMinSize(800, 600) },
    { name: "guide-create", path: "/guides/create", component: GuideEditView, beforeEnter: () => setMinSize(800, 800) },
    { name: "guide-edit", path: "/guides/:id/edit", component: GuideEditView, beforeEnter: () => setMinSize(800, 800) },

    // 脚本 routes
    {
        name: "script-list",
        path: "/scripts",
        component: () => import("./views/ScriptListView.vue"),
        beforeEnter: () => setMinSize(800, 600),
    },
    {
        name: "script-color-tool",
        path: "/scripts/color-tool",
        component: () => import("./views/ScriptColorToolView.vue"),
        beforeEnter: () => setMinSize(1000, 700),
    },
    {
        name: "script-record-tool",
        path: "/scripts/record-tool",
        component: () => import("./views/ScriptRecordToolView.vue"),
        beforeEnter: () => setMinSize(1000, 700),
    },

    // 404 页面 - 必须放在最后作为捕获所有未匹配路由
    { path: "/:pathMatch(.*)*", name: "notfound", component: NotFound, beforeEnter: () => setMinSize(360, 430) },
]

export const router = createRouter({
    // 应用内使用 hash 模式，其他环境使用 history 模式
    history: env.isApp ? createWebHashHistory() : createWebHistory(),
    routes,
})
