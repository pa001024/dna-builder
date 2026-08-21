import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window"
import { createRouter, createWebHashHistory, createWebHistory, type RouteRecordRaw } from "vue-router"
import { env } from "./env"

const AchievementList = () => import("./views/AchievementList.vue")
const CharBuildCompare = () => import("./views/CharBuildCompare.vue")
const CharBuildView = () => import("./views/CharBuildView.vue")
const CharListView = () => import("./views/CharListView.vue")
const CounterView = () => import("./views/CounterView.vue")
const GuideDetailView = () => import("./views/GuideDetailView.vue")
const GuideEditView = () => import("./views/GuideEditView.vue")
const GuideListView = () => import("./views/GuideListView.vue")
const Home = () => import("./views/Home.vue")
const InventoryEdit = () => import("./views/InventoryEdit.vue")
const More = () => import("./views/More.vue")
const NotFound = () => import("./views/NotFound.vue")
const Setting = () => import("./views/Setting.vue")
const TimelineEditor = () => import("./views/TimelineEditor.vue")
const UserManager = () => import("./views/UserManager.vue")

let setMinSize = async (_w: number, _h: number) => {}
;(() => {
    if (!env.isApp) return
    setMinSize = async (w: number, h: number) => {
        const win = getCurrentWindow()
        if (!(await win.isMaximized())) win.setMinSize(new LogicalSize(w, h))
    }
})()

// NOTE: every router must have i18n key like xx.title it will be used by ResizeableWindow.vue by default
const routes: readonly RouteRecordRaw[] = [
    { name: "home", path: "/", component: Home, beforeEnter: () => setMinSize(360, 430) },
    { name: "counter", path: "/counter", component: CounterView, beforeEnter: () => setMinSize(360, 430) },
    { name: "setting", path: "/setting", component: Setting, beforeEnter: () => setMinSize(360, 430) },
    {
        name: "points-mall",
        path: "/points-mall",
        component: () => import("./views/PointsMall.vue"),
        beforeEnter: () => setMinSize(360, 430),
    },
    {
        name: "race-lottery",
        path: "/race-lottery",
        component: () => import("./views/RaceLottery.vue"),
        beforeEnter: () => setMinSize(360, 430),
    },
    {
        name: "skin-gacha",
        path: "/skin-gacha",
        component: () => import("./views/SkinGachaView.vue"),
        beforeEnter: () => setMinSize(360, 430),
    },
    {
        path: "/char",
        children: [
            { name: "char-build-list", path: "", component: CharListView, beforeEnter: () => setMinSize(360, 430) },
            { name: "char-build", path: ":charId", component: CharBuildView, beforeEnter: () => setMinSize(360, 430) },
            { name: "char-build-code", path: ":charId/:buildId", component: CharBuildView, beforeEnter: () => setMinSize(360, 430) },
        ],
    },
    { name: "build-compare", path: "/char-build-compare", component: CharBuildCompare, beforeEnter: () => setMinSize(360, 430) },
    {
        path: "/timeline",
        children: [
            { name: "timeline", path: "", component: TimelineEditor, beforeEnter: () => setMinSize(360, 430) },
            { name: "timeline-share", path: ":timelineId", component: TimelineEditor, beforeEnter: () => setMinSize(360, 430) },
        ],
    },
    { name: "inventory", path: "/inventory", component: InventoryEdit, beforeEnter: () => setMinSize(360, 430) },
    { name: "achievement", path: "/achievement", component: AchievementList, beforeEnter: () => setMinSize(360, 430) },
    {
        name: "abyss-usage",
        path: "/abyss-usage",
        component: () => import("./views/AbyssUsageView.vue"),
        beforeEnter: () => setMinSize(360, 430),
    },
    {
        name: "game-launcher",
        path: "/game-launcher",
        component: env.isApp ? () => import("./views/GameLauncher.vue") : () => undefined,
        beforeEnter: () => setMinSize(360, 430),
    },
    {
        name: "mod-manager",
        path: "/mods",
        component: () => import("./views/ModManagerView.vue"),
        beforeEnter: () => setMinSize(360, 430),
    },
    {
        name: "mods-detail",
        path: "/mods/:id",
        component: () => import("./views/ModDetailView.vue"),
        beforeEnter: () => setMinSize(360, 430),
    },
    { name: "game-accounts", path: "/game-accounts", component: UserManager, beforeEnter: () => setMinSize(360, 430) },
    { name: "unpack", path: "/unpack", component: () => import("./views/UnpackView.vue"), beforeEnter: () => setMinSize(360, 430) },
    {
        name: "skin-colorize",
        path: "/skin-colorize",
        component: () => import("./views/SkinColorizeGalleryView.vue"),
        beforeEnter: () => setMinSize(360, 430),
    },
    {
        name: "skin-colorize-create",
        path: "/skin-colorize/new",
        component: () => import("./views/SkinColorizeView.vue"),
        beforeEnter: () => setMinSize(360, 430),
    },
    {
        name: "skin-colorize-share",
        path: "/skin-colorize/:planId",
        component: () => import("./views/SkinColorizeView.vue"),
        beforeEnter: () => setMinSize(360, 430),
    },
    {
        name: "more",
        path: "/more",
        component: More,
        beforeEnter: () => setMinSize(360, 430),
    },
    {
        name: "flow",
        path: "/flow",
        component: () => import("./views/FlowBuildView.vue"),
        beforeEnter: () => setMinSize(360, 430),
    },
    // more: lazy load
    {
        name: "dps",
        path: "/dps",
        component: () => import("./views/CharDPSView.vue"),
        beforeEnter: () => setMinSize(360, 430),
    },
    {
        name: "levelup",
        path: "/levelup",
        component: () => import("./views/LevelUpCalculatorView.vue"),
        beforeEnter: () => setMinSize(360, 430),
    },
    // { name: "ai", path: "/ai", component: () => import("./views/AIAgent.vue"), beforeEnter: () =>setMinSize(360, 430) },
    { name: "help", path: "/help", component: () => import("./views/Help.vue"), beforeEnter: () => setMinSize(360, 430) },
    {
        name: "chat",
        path: "/chat",
        component: () => import("./views/Chat.vue"),
        beforeEnter: () => setMinSize(360, 430),
        meta: { keepAlive: true },
        children: [
            { name: "room", path: ":room", component: () => import("./views/ChatRoom.vue") }, //
        ],
    },
    // admin
    {
        path: "/admin",
        component: () => import("./admin/AdminLayout.vue"),
        beforeEnter: () => setMinSize(360, 430),
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
            {
                name: "admin-shop-product",
                path: "shop-product",
                component: () => import("./admin/ShopProductManagement.vue"),
            },
            {
                name: "admin-shop-redemption",
                path: "shop-redemption",
                component: () => import("./admin/ShopRedemptionManagement.vue"),
            },
            {
                name: "admin-ranking",
                path: "ranking",
                component: () => import("./admin/RankingManagement.vue"),
            },
            {
                name: "admin-dyeplan",
                path: "dyeplan",
                component: () => import("./admin/DyePlanManagement.vue"),
            },
            {
                name: "admin-game-mod",
                path: "game-mod",
                component: () => import("./admin/GameModManagement.vue"),
            },
        ],
    },
    {
        name: "ranking-list",
        path: "/ranking",
        component: () => import("./views/RankingView.vue"),
        beforeEnter: () => setMinSize(360, 430),
    },
    {
        name: "ranking",
        path: "/ranking/:id",
        component: () => import("./views/RankingView.vue"),
        beforeEnter: () => setMinSize(360, 430),
    },
    {
        name: "map-tool",
        path: "/map-tool",
        component: () => import("./components/MapTool.vue"),
        beforeEnter: () => setMinSize(360, 430),
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
                beforeEnter: () => setMinSize(360, 430),
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
                beforeEnter: () => setMinSize(360, 430),
            },
            {
                name: "book-detail",
                path: "book/:id",
                component: () => import("./views/DBBookDetailView.vue"),
                beforeEnter: () => setMinSize(360, 430),
            },
            {
                name: "music-list",
                path: "music",
                component: () => import("./views/DBMusicListView.vue"),
                beforeEnter: () => setMinSize(320, 360),
            },
            {
                name: "music-detail",
                path: "music/:id",
                component: () => import("./views/DBMusicDetailView.vue"),
                beforeEnter: () => setMinSize(320, 360),
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
                name: "forge-list",
                path: "forge",
                component: () => import("./views/DBForgeListView.vue"),
                beforeEnter: () => setMinSize(320, 360),
            },
            {
                name: "forge-detail",
                path: "forge/:id",
                component: () => import("./views/DBForgeDetailView.vue"),
                beforeEnter: () => setMinSize(320, 360),
            },
            {
                name: "event-list",
                path: "event",
                component: () => import("./views/DBEventListView.vue"),
                beforeEnter: () => setMinSize(320, 360),
            },
            {
                name: "event-detail",
                path: "event/:id",
                component: () => import("./views/DBEventDetailView.vue"),
                beforeEnter: () => setMinSize(320, 360),
            },
            {
                name: "solotreasure-list",
                path: "solotreasure",
                component: () => import("./views/DBSoloTreasureView.vue"),
                beforeEnter: () => setMinSize(360, 430),
                meta: { title: "database.solotreasure" },
            },
            {
                name: "resource-list",
                path: "resource",
                component: () => import("./views/DBResourceListView.vue"),
                beforeEnter: () => setMinSize(320, 360),
            },
            {
                name: "resource-detail",
                path: "resource/:id",
                component: () => import("./views/DBResourceDetailView.vue"),
                beforeEnter: () => setMinSize(320, 360),
            },
            {
                name: "iron-ticket-list",
                path: "iron-ticket",
                component: () => import("./views/DBIronTicketListView.vue"),
                beforeEnter: () => setMinSize(320, 360),
            },
            {
                name: "iron-ticket-detail",
                path: "iron-ticket/:id",
                component: () => import("./views/DBIronTicketDetailView.vue"),
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
                beforeEnter: () => setMinSize(360, 430),
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
                beforeEnter: () => setMinSize(360, 430),
            },
            {
                name: "hardboss-detail",
                path: "hardboss/:bossId",
                component: () => import("./views/DBHardbossDetailView.vue"),
                beforeEnter: () => setMinSize(360, 430),
            },
            {
                name: "dynquest-list",
                path: "dynquest",
                component: () => import("./views/DBDynQuestListView.vue"),
                beforeEnter: () => setMinSize(360, 430),
                meta: { title: "database.dynquest" },
            },
            {
                name: "dynquest-detail",
                path: "dynquest/:questId",
                component: () => import("./views/DBDynQuestDetailView.vue"),
                beforeEnter: () => setMinSize(360, 430),
                meta: { title: "database.dynquest" },
            },
            {
                name: "partytopic-list",
                path: "partytopic",
                component: () => import("./views/DBPartyTopicListView.vue"),
                beforeEnter: () => setMinSize(360, 430),
            },
            {
                name: "partytopic-detail",
                path: "partytopic/:partyTopicId",
                component: () => import("./views/DBPartyTopicDetailView.vue"),
                beforeEnter: () => setMinSize(360, 430),
            },
            {
                name: "questchain-list",
                path: "questchain",
                component: () => import("./views/DBQuestChainListView.vue"),
                beforeEnter: () => setMinSize(360, 430),
            },
            {
                name: "questchain-detail",
                path: "questchain/:questChainId/:questId?",
                component: () => import("./views/DBQuestDetailView.vue"),
                beforeEnter: () => setMinSize(360, 430),
            },
            {
                name: "achievement-list",
                path: "achievement",
                component: () => import("./views/DBAchievementListView.vue"),
                beforeEnter: () => setMinSize(360, 430),
            },
            {
                name: "achievement-detail",
                path: "achievement/:id",
                component: () => import("./views/DBAchievementDetailView.vue"),
                beforeEnter: () => setMinSize(360, 430),
            },
            {
                name: "npc-list",
                path: "npc",
                component: () => import("./views/DBNpcListView.vue"),
                beforeEnter: () => setMinSize(360, 430),
                meta: { keepAlive: true },
            },
            {
                name: "impr-list",
                path: "impr",
                component: () => import("./views/DBImprView.vue"),
                beforeEnter: () => setMinSize(360, 430),
                meta: { title: "database.impr" },
            },
            {
                name: "npc-detail",
                path: "npc/:npcId",
                component: () => import("./views/DBNpcDetailView.vue"),
                beforeEnter: () => setMinSize(360, 430),
            },
            {
                name: "rouge-list",
                path: "rouge",
                component: () => import("./views/DBRougeView.vue"),
                beforeEnter: () => setMinSize(360, 430),
                meta: { title: "database.rouge" },
            },
            {
                name: "rouge-detail",
                path: "rouge/:mode/:kind/:id",
                component: () => import("./views/DBRougeDetailView.vue"),
                beforeEnter: () => setMinSize(360, 430),
                meta: { title: "database.rouge" },
            },
        ],
    },
    // DNA routes
    {
        path: "/dna",
        children: [
            { name: "dna-home", path: "/dna", component: () => import("./views/DNAHomeView.vue"), beforeEnter: () => setMinSize(360, 430) },
            {
                name: "dna-role-detail",
                path: "char/:charId/:charEid",
                component: () => import("./views/DNARoleDetailView.vue"),
                beforeEnter: () => setMinSize(360, 430),
            },
            {
                name: "dna-weapon-detail",
                path: "weapon/:weaponId/:weaponEid",
                component: () => import("./views/DNAWeaponDetailView.vue"),
                beforeEnter: () => setMinSize(360, 430),
            },
            {
                name: "dna-mine",
                path: "mine",
                component: () => import("./views/DNAUserMineView.vue"),
                beforeEnter: () => setMinSize(360, 430),
            },
            {
                name: "dna-user",
                path: "mine/:userId",
                component: () => import("./views/DNAUserMineView.vue"),
                beforeEnter: () => setMinSize(360, 430),
            },
            {
                name: "dna-posts",
                path: "posts/:forumId",
                component: () => import("./views/DNAPostListView.vue"),
                beforeEnter: () => setMinSize(360, 430),
            },
            {
                name: "dna-topic",
                path: "topic/:topicId",
                component: () => import("./views/DNAPostListView.vue"),
                beforeEnter: () => setMinSize(360, 430),
            },
            {
                name: "dna-post-detail",
                path: "posts/:forumId/:postId",
                component: () => import("./views/DNAPostDetailView.vue"),
                beforeEnter: () => setMinSize(360, 430),
            },
        ],
    },

    // 攻略 routes
    { name: "guide-list", path: "/guides", component: GuideListView, beforeEnter: () => setMinSize(360, 430) },
    { name: "guide-detail", path: "/guides/:id", component: GuideDetailView, beforeEnter: () => setMinSize(360, 430) },
    { name: "guide-create", path: "/guides/create", component: GuideEditView, beforeEnter: () => setMinSize(360, 430) },
    { name: "guide-edit", path: "/guides/:id/edit", component: GuideEditView, beforeEnter: () => setMinSize(360, 430) },

    // 脚本 routes
    {
        name: "script-list",
        path: "/scripts",
        component: () => import("./views/ScriptListView.vue"),
        beforeEnter: () => setMinSize(360, 430),
    },
    {
        name: "script-color-tool",
        path: "/scripts/color-tool",
        component: () => import("./views/ScriptColorToolView.vue"),
        beforeEnter: () => setMinSize(360, 430),
    },
    {
        name: "script-record-tool",
        path: "/scripts/record-tool",
        component: () => import("./views/ScriptRecordToolView.vue"),
        beforeEnter: () => setMinSize(360, 430),
    },

    // 404 页面 - 必须放在最后作为捕获所有未匹配路由
    { path: "/:pathMatch(.*)*", name: "notfound", component: NotFound, beforeEnter: () => setMinSize(360, 430) },
]

export const router = createRouter({
    // 应用内使用 hash 模式，其他环境使用 history 模式
    history: env.isApp ? createWebHashHistory() : createWebHistory(),
    routes,
})
