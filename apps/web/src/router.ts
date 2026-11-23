import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window"
import { createMemoryHistory, createRouter, createWebHashHistory, createWebHistory, type RouteRecordRaw, type Router } from "vue-router"
import { env } from "./env"
import { resolveLegacyTranscendenceRoute } from "./utils/transcendence-routes"

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
// 导出路由表：SSG 预渲染（src/ssr/entry-server.ts）需要用同一张表建 memory history 实例
export const routes: readonly RouteRecordRaw[] = [
    { name: "home", path: "/", component: Home, beforeEnter: () => setMinSize(320, 360) },
    { name: "counter", path: "/counter", component: CounterView, beforeEnter: () => setMinSize(320, 360), meta: { requireData: false } },
    { name: "setting", path: "/setting", component: Setting, beforeEnter: () => setMinSize(320, 360) },
    {
        // 组件调试页：dob-ui 全部组件 + 常用组合场景，不依赖游戏数据
        name: "dev-components",
        path: "/dev/components",
        component: () => import("./views/DevComponentsView.vue"),
        beforeEnter: () => setMinSize(320, 360),
        meta: { requireData: false },
    },
    {
        // APP 下载页：不依赖游戏数据包；PC 端展示二维码，移动端倒计时直接下载，参与 SSG 预渲染
        name: "download",
        path: "/download",
        component: () => import("./views/DownloadAppView.vue"),
        beforeEnter: () => setMinSize(320, 360),
        meta: { requireData: false },
    },
    {
        // 技能 CD 浮窗搬到独立页面:设置页只保留总开关与入口
        name: "skill-cd-overlay",
        path: "/skill-cd-overlay",
        component: () => import("./views/SkillCdOverlayView.vue"),
        beforeEnter: () => setMinSize(320, 360),
        meta: { requireData: false },
    },
    {
        // 屏幕信息条:独立 WebviewWindow 的承载页,只读 localStorage 里的配置与密函数据。
        // 不设 minSize —— 该窗口要收缩到内容尺寸,设置最小尺寸会让它无法贴合内容。
        name: "screen-bar",
        path: "/screen-bar",
        component: () => import("./views/ScreenBarView.vue"),
        meta: { requireData: false },
    },
    {
        // 狩月动画独立小窗：透明置顶，只画官方素材动画，不加载数据包
        name: "afk-widget",
        path: "/afk-widget",
        component: () => import("./views/AfkWidgetView.vue"),
        meta: { requireData: false },
    },
    {
        // 桌面分身克隆窗口：无边框独立窗口，不套主应用布局，也不走主窗口的最小尺寸约束
        name: "desktop-clone",
        path: "/desktop-clone",
        component: () => import("./views/DesktopCloneView.vue"),
        meta: { requireData: false },
    },
    {
        name: "points-mall",
        path: "/points-mall",
        component: () => import("./views/PointsMall.vue"),
        beforeEnter: () => setMinSize(320, 360),
    },
    {
        name: "race-lottery",
        path: "/race-lottery",
        component: () => import("./views/RaceLottery.vue"),
        beforeEnter: () => setMinSize(320, 360),
    },
    {
        name: "skin-gacha",
        path: "/skin-gacha",
        component: () => import("./views/SkinGachaView.vue"),
        beforeEnter: () => setMinSize(320, 360),
    },
    {
        path: "/char",
        children: [
            { name: "char-build-list", path: "", component: CharListView, beforeEnter: () => setMinSize(320, 360) },
            { name: "char-build", path: ":charId", component: CharBuildView, beforeEnter: () => setMinSize(320, 360) },
            { name: "char-build-code", path: ":charId/:buildId", component: CharBuildView, beforeEnter: () => setMinSize(320, 360) },
        ],
    },
    { name: "build-compare", path: "/char-build-compare", component: CharBuildCompare, beforeEnter: () => setMinSize(320, 360) },
    {
        // 深链中转：`dobapp://open-build/<id>` 与短链 `/build/<id>` 的落点，查到归属角色后 replace 到分享构筑页（与 dob-app 的 `/build/:id` 同构）
        name: "build-detail",
        path: "/build/:id",
        component: () => import("./views/BuildRedirectView.vue"),
        beforeEnter: () => setMinSize(320, 360),
        meta: { requireData: false },
    },
    {
        path: "/timeline",
        children: [
            { name: "timeline", path: "", component: TimelineEditor, beforeEnter: () => setMinSize(320, 360) },
            { name: "timeline-share", path: ":timelineId", component: TimelineEditor, beforeEnter: () => setMinSize(320, 360) },
        ],
    },
    { name: "inventory", path: "/inventory", component: InventoryEdit, beforeEnter: () => setMinSize(320, 360) },
    { name: "achievement", path: "/achievement", component: AchievementList, beforeEnter: () => setMinSize(320, 360) },
    {
        name: "abyss-usage",
        path: "/abyss-usage",
        component: () => import("./views/AbyssUsageView.vue"),
        beforeEnter: () => setMinSize(320, 360),
    },
    {
        name: "game-launcher",
        path: "/game-launcher",
        component: env.isApp ? () => import("./views/GameLauncher.vue") : () => undefined,
        beforeEnter: () => setMinSize(320, 360),
    },
    {
        name: "log-analysis",
        path: "/log-analysis",
        component: env.isApp ? () => import("./views/LogAnalysisView.vue") : () => undefined,
        beforeEnter: () => setMinSize(720, 520),
    },
    {
        name: "afk-ledger",
        path: "/afk",
        component: () => import("./views/AfkLedgerView.vue"),
        beforeEnter: () => setMinSize(320, 360),
    },
    {
        name: "mod-manager",
        path: "/mods",
        component: () => import("./views/ModManagerView.vue"),
        beforeEnter: () => setMinSize(320, 360),
    },
    {
        name: "mods-detail",
        path: "/mods/:id",
        component: () => import("./views/ModDetailView.vue"),
        beforeEnter: () => setMinSize(320, 360),
    },
    { name: "game-accounts", path: "/game-accounts", component: UserManager, beforeEnter: () => setMinSize(320, 360) },
    { name: "unpack", path: "/unpack", component: () => import("./views/UnpackView.vue"), beforeEnter: () => setMinSize(320, 360) },
    {
        name: "skin-colorize",
        path: "/skin-colorize",
        component: () => import("./views/SkinColorizeGalleryView.vue"),
        beforeEnter: () => setMinSize(320, 360),
    },
    {
        name: "skin-colorize-create",
        path: "/skin-colorize/new",
        component: () => import("./views/SkinColorizeView.vue"),
        beforeEnter: () => setMinSize(320, 360),
    },
    {
        name: "skin-colorize-share",
        path: "/skin-colorize/:planId",
        component: () => import("./views/SkinColorizeView.vue"),
        beforeEnter: () => setMinSize(320, 360),
    },
    {
        name: "more",
        path: "/more",
        component: More,
        beforeEnter: () => setMinSize(320, 360),
    },
    {
        name: "flow",
        path: "/flow",
        component: () => import("./views/FlowBuildView.vue"),
        beforeEnter: () => setMinSize(320, 360),
    },
    {
        // 分享节点图载入页：对标 `/char/:charId/:buildId`，短链 `/graph/:id` 中转到这里
        name: "flow-share",
        path: "/flow/:graphId",
        component: () => import("./views/FlowBuildView.vue"),
        beforeEnter: () => setMinSize(320, 360),
    },
    {
        // 短链中转：与 `/build/:id` 同构，查到图后 replace 到 `/flow/:graphId`
        name: "graph-detail",
        path: "/graph/:id",
        component: () => import("./views/GraphRedirectView.vue"),
        beforeEnter: () => setMinSize(320, 360),
        meta: { requireData: false },
    },
    // more: lazy load
    {
        name: "dps",
        path: "/dps",
        component: () => import("./views/CharDPSView.vue"),
        beforeEnter: () => setMinSize(320, 360),
    },
    {
        name: "levelup",
        path: "/levelup",
        component: () => import("./views/LevelUpCalculatorView.vue"),
        beforeEnter: () => setMinSize(320, 360),
    },
    {
        name: "help",
        path: "/help",
        component: () => import("./views/help/HelpView.vue"),
        beforeEnter: () => setMinSize(320, 360),
        // 帮助中心不依赖游戏数据包：空环境 / 首次启动也能直接阅读
        meta: { requireData: false },
    },
    {
        name: "chat",
        path: "/chat",
        component: () => import("./views/Chat.vue"),
        beforeEnter: () => setMinSize(320, 360),
        meta: { keepAlive: true },
        children: [
            { name: "room", path: ":room", component: () => import("./views/ChatRoom.vue") }, //
        ],
    },
    // BUG 库：公开页，不依赖游戏数据包（未安装数据包也能反馈）
    {
        name: "bug-list",
        path: "/bugs",
        component: () => import("./views/BugListView.vue"),
        beforeEnter: () => setMinSize(320, 360),
        meta: { requireData: false },
    },
    {
        name: "bug-new",
        path: "/bugs/new",
        component: () => import("./views/BugNewView.vue"),
        beforeEnter: () => setMinSize(320, 360),
        meta: { requireData: false },
    },
    {
        name: "bug-mine",
        path: "/bugs/mine",
        component: () => import("./views/BugMineView.vue"),
        beforeEnter: () => setMinSize(320, 360),
        meta: { requireData: false },
    },
    {
        name: "bug-submission",
        path: "/bugs/submissions/:submissionId",
        component: () => import("./views/BugSubmissionView.vue"),
        beforeEnter: () => setMinSize(320, 360),
        meta: { requireData: false },
    },
    {
        name: "bug-detail",
        path: "/bugs/:bugId",
        component: () => import("./views/BugDetailView.vue"),
        beforeEnter: () => setMinSize(320, 360),
        meta: { requireData: false },
    },
    // admin
    {
        path: "/admin",
        component: () => import("./admin/AdminLayout.vue"),
        beforeEnter: () => setMinSize(320, 360),
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
                name: "admin-graph",
                path: "graph",
                component: () => import("./admin/GraphManagement.vue"),
                beforeEnter: () => setMinSize(320, 360),
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
            {
                name: "admin-ai-log",
                path: "ai-log",
                component: () => import("./admin/AiLogManagement.vue"),
            },
            {
                name: "admin-agent-skill",
                path: "agent-skill",
                component: () => import("./admin/AgentSkillManagement.vue"),
            },
            {
                name: "admin-ai-recharge",
                path: "ai-recharge",
                component: () => import("./admin/AiRechargeManagement.vue"),
            },
            {
                name: "admin-bugs",
                path: "bugs",
                component: () => import("./admin/BugManagement.vue"),
            },
            {
                name: "admin-bug-jobs",
                path: "bug-jobs",
                component: () => import("./admin/BugJobsManagement.vue"),
            },
            {
                name: "admin-bug-sync",
                path: "bug-sync",
                component: () => import("./admin/BugSyncManagement.vue"),
            },
        ],
    },
    {
        name: "ranking-list",
        path: "/ranking",
        component: () => import("./views/RankingView.vue"),
        beforeEnter: () => setMinSize(320, 360),
    },
    {
        name: "ranking",
        path: "/ranking/:id",
        component: () => import("./views/RankingView.vue"),
        beforeEnter: () => setMinSize(320, 360),
    },
    {
        // 魔灵地图：一级独立路由（侧边栏「地图」标签直接指向这里）
        name: "map-tool",
        path: "/map-tool",
        component: () => import("./components/MapTool.vue"),
        beforeEnter: () => setMinSize(320, 360),
    },
    // 资料库路由
    {
        path: "/db",
        children: [
            {
                name: "database",
                path: "",
                // 走外壳加载：外壳依赖极轻，先绘制骨架屏，再异步载入带整套游戏数据的真实页面。
                // 外壳 chunk 由 main.ts 在启动后空闲期预热，点进资料库时骨架屏可以当帧上屏。
                component: () => import("./views/DBViewShell.vue"),
                beforeEnter: () => setMinSize(320, 360),
            },
            {
                name: "db-damage",
                path: "damage",
                component: () => import("./views/DBDamageView.vue"),
                beforeEnter: () => setMinSize(320, 360),
            },
            // 升华（DNASeason）资料库：layout 内切换大区（不播整页动画），实体详情仍为顶层整页路由
            {
                path: "transcendence",
                component: () => import("./views/DBTranscendenceLayout.vue"),
                // 旧 ?tab= 归一化在全局 beforeEach（需要覆盖 query-only 导航），这里只管窗口最小尺寸
                beforeEnter: async () => {
                    await setMinSize(320, 360)
                },
                meta: { title: "database.transcendence", transitionKey: "/db/transcendence" },
                // 子路由不各自设 beforeEnter：父级 beforeEnter 在首次进入时已执行 setMinSize，
                // 子路由之间切换沿用同一窗口尺寸，不需要重复声明（评审 waiver）
                children: [
                    {
                        name: "transcendence",
                        path: "",
                        component: () => import("./views/DBTranscendenceView.vue"),
                        meta: { title: "database.transcendence" },
                    },
                    {
                        name: "transcendence-talent-list",
                        path: "talent",
                        component: () => import("./views/DBTranscendenceTalentView.vue"),
                        meta: { title: "db-transcendence.tab.talents" },
                    },
                    {
                        name: "transcendence-gear",
                        path: "gear",
                        redirect: to => ({ path: "/db/transcendence/gear/affix", query: to.query, hash: to.hash }),
                        meta: { title: "db-transcendence.tab.gear" },
                    },
                    {
                        name: "transcendence-gear-affix-list",
                        path: "gear/affix",
                        component: () => import("./views/DBTranscendenceGearAffixView.vue"),
                        meta: { title: "db-transcendence.tab.gear" },
                    },
                    {
                        name: "transcendence-gear-unique-list",
                        path: "gear/unique",
                        component: () => import("./views/DBTranscendenceGearUniqueView.vue"),
                        meta: { title: "db-transcendence.tab.gear" },
                    },
                    {
                        name: "transcendence-gear-base",
                        path: "gear/base",
                        component: () => import("./views/DBTranscendenceGearBaseView.vue"),
                        meta: { title: "db-transcendence.tab.gear" },
                    },
                    {
                        name: "transcendence-gear-inlay",
                        path: "gear/inlay",
                        component: () => import("./views/DBTranscendenceGearInlayView.vue"),
                        meta: { title: "db-transcendence.tab.gear" },
                    },
                    {
                        name: "transcendence-gear-craft",
                        path: "gear/craft",
                        component: () => import("./views/DBTranscendenceGearCraftView.vue"),
                        meta: { title: "db-transcendence.tab.gear" },
                    },
                    {
                        name: "transcendence-rift-list",
                        path: "rift",
                        component: () => import("./views/DBTranscendenceRiftView.vue"),
                        meta: { title: "db-transcendence.tab.rift" },
                    },
                    {
                        name: "transcendence-rift-elite",
                        path: "rift/elite",
                        component: () => import("./views/DBTranscendenceRiftView.vue"),
                        meta: { title: "db-transcendence.tab.rift" },
                    },
                    {
                        name: "transcendence-rift-rules",
                        path: "rift/rules",
                        component: () => import("./views/DBTranscendenceRiftView.vue"),
                        meta: { title: "db-transcendence.tab.rift" },
                    },
                    {
                        name: "transcendence-nest-list",
                        path: "nest",
                        component: () => import("./views/DBTranscendenceNestView.vue"),
                        meta: { title: "db-transcendence.tab.nest" },
                    },
                    {
                        name: "transcendence-commission-list",
                        path: "commission",
                        component: () => import("./views/DBTranscendenceCommissionView.vue"),
                        meta: { title: "db-transcendence.overview.commissions" },
                    },
                    {
                        name: "transcendence-journey-list",
                        path: "journey",
                        component: () => import("./views/DBTranscendenceJourneyView.vue"),
                        meta: { title: "db-transcendence.tab.journey" },
                    },
                    {
                        // 旧委托子页已并入独立「委托」页，保留路由名兼容旧链接
                        name: "transcendence-journey-commissions",
                        path: "journey/commissions",
                        redirect: to => ({ path: "/db/transcendence/commission", query: to.query, hash: to.hash }),
                        meta: { title: "db-transcendence.overview.commissions" },
                    },
                    {
                        name: "transcendence-journey-buffs",
                        path: "journey/buffs",
                        component: () => import("./views/DBTranscendenceJourneyView.vue"),
                        meta: { title: "db-transcendence.tab.journey" },
                    },
                ],
            },
            // 实体详情：顶层整页路由，列表 → 详情仍走外层切换动画
            {
                name: "transcendence-talent-detail",
                path: "transcendence/talent/:id(\\d+)",
                component: () => import("./views/DBTranscendenceTalentDetailView.vue"),
                beforeEnter: () => setMinSize(320, 360),
                meta: { title: "db-transcendence.tab.talents" },
            },
            // 旧实体详情入口：列表已改页内 SplitView，这里保留兼容重定向（必须在 catch-all 之前）
            {
                name: "transcendence-gear-affix-detail",
                path: "transcendence/gear/affix/:id(\\d+)",
                redirect: to => ({ path: "/db/transcendence/gear/affix", query: { ...to.query, id: String(to.params.id) }, hash: to.hash }),
                meta: { title: "db-transcendence.tab.gear" },
            },
            {
                name: "transcendence-gear-unique-detail",
                path: "transcendence/gear/unique/:id(\\d+)",
                redirect: to => ({
                    path: "/db/transcendence/gear/unique",
                    query: { ...to.query, id: String(to.params.id) },
                    hash: to.hash,
                }),
                meta: { title: "db-transcendence.tab.gear" },
            },
            {
                name: "transcendence-gear-base-detail",
                path: "transcendence/gear/base/:id(\\d+)",
                redirect: to => ({ path: "/db/transcendence/gear/base", query: { ...to.query, id: String(to.params.id) }, hash: to.hash }),
                meta: { title: "db-transcendence.tab.gear" },
            },
            {
                // 螺旋楼层详情已并入列表页右侧，旧独立详情路由改为页内 `?id=` 选择
                name: "transcendence-rift-detail",
                path: "transcendence/rift/:id(\\d+)",
                redirect: to => ({ path: "/db/transcendence/rift", query: { ...to.query, id: String(to.params.id) }, hash: to.hash }),
                meta: { title: "db-transcendence.tab.rift" },
            },
            {
                name: "transcendence-nest-detail",
                path: "transcendence/nest/:dungeonId(\\d+)",
                component: () => import("./views/DBTranscendenceNestDetailView.vue"),
                beforeEnter: () => setMinSize(320, 360),
                meta: { title: "db-transcendence.tab.nest" },
            },
            {
                name: "transcendence-commission-detail",
                path: "transcendence/commission/:dungeonId(\\d+)",
                component: () => import("./views/DBTranscendenceCommissionDetailView.vue"),
                beforeEnter: () => setMinSize(320, 360),
                meta: { title: "db-transcendence.overview.commissions" },
            },
            {
                name: "transcendence-journey-quest-detail",
                path: "transcendence/journey/quest/:id(\\d+)",
                component: () => import("./views/DBTranscendenceJourneyQuestView.vue"),
                beforeEnter: () => setMinSize(320, 360),
                meta: { title: "db-transcendence.tab.journey" },
            },
            {
                name: "transcendence-not-found",
                path: "transcendence/:pathMatch(.*)*",
                component: () => import("./views/DBTranscendenceNotFoundView.vue"),
                beforeEnter: () => setMinSize(320, 360),
                meta: { title: "database.transcendence" },
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
                meta: { title: "database.title_data" },
            },
            {
                name: "title-detail",
                path: "title/:id",
                component: () => import("./views/DBTitleDetailView.vue"),
                beforeEnter: () => setMinSize(320, 360),
            },
            {
                name: "archive-list",
                path: "archive",
                component: () => import("./views/DBArchiveListView.vue"),
                beforeEnter: () => setMinSize(320, 360),
                meta: { title: "database.archive" },
            },
            {
                name: "book-list",
                path: "book",
                component: () => import("./views/DBBookListView.vue"),
                beforeEnter: () => setMinSize(320, 360),
            },
            {
                name: "book-detail",
                path: "book/:id",
                component: () => import("./views/DBBookDetailView.vue"),
                beforeEnter: () => setMinSize(320, 360),
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
                beforeEnter: () => setMinSize(320, 360),
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
                // 旧地址兼容：魔灵地图已独立为一级路由 /map-tool，这里重定向以保证 URL 归一化（高亮、深链参数都跟着走）
                path: "map-local",
                redirect: to => ({ path: "/map-tool", query: to.query, hash: to.hash }),
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
                beforeEnter: () => setMinSize(320, 360),
            },
            {
                name: "hardboss-detail",
                path: "hardboss/:bossId",
                component: () => import("./views/DBHardbossDetailView.vue"),
                beforeEnter: () => setMinSize(320, 360),
            },
            {
                name: "dynquest-list",
                path: "dynquest",
                component: () => import("./views/DBDynQuestListView.vue"),
                beforeEnter: () => setMinSize(320, 360),
                meta: { title: "database.dynquest" },
            },
            {
                name: "dynquest-detail",
                path: "dynquest/:questId",
                component: () => import("./views/DBDynQuestDetailView.vue"),
                beforeEnter: () => setMinSize(320, 360),
                meta: { title: "database.dynquest" },
            },
            {
                name: "partytopic-list",
                path: "partytopic",
                component: () => import("./views/DBPartyTopicListView.vue"),
                beforeEnter: () => setMinSize(320, 360),
            },
            {
                name: "partytopic-detail",
                path: "partytopic/:partyTopicId",
                component: () => import("./views/DBPartyTopicDetailView.vue"),
                beforeEnter: () => setMinSize(320, 360),
            },
            {
                name: "questchain-list",
                path: "questchain",
                component: () => import("./views/DBQuestChainListView.vue"),
                beforeEnter: () => setMinSize(320, 360),
            },
            {
                name: "questchain-detail",
                path: "questchain/:questChainId/:questId?",
                component: () => import("./views/DBQuestDetailView.vue"),
                beforeEnter: () => setMinSize(320, 360),
            },
            {
                name: "achievement-list",
                path: "achievement",
                component: () => import("./views/DBAchievementListView.vue"),
                beforeEnter: () => setMinSize(320, 360),
            },
            {
                name: "achievement-detail",
                path: "achievement/:id",
                component: () => import("./views/DBAchievementDetailView.vue"),
                beforeEnter: () => setMinSize(320, 360),
            },
            {
                name: "npc-list",
                path: "npc",
                component: () => import("./views/DBNpcListView.vue"),
                beforeEnter: () => setMinSize(320, 360),
                meta: { keepAlive: true },
            },
            {
                name: "impr-list",
                path: "impr",
                component: () => import("./views/DBImprView.vue"),
                beforeEnter: () => setMinSize(320, 360),
                meta: { title: "database.impr" },
            },
            {
                name: "npc-detail",
                path: "npc/:npcId",
                component: () => import("./views/DBNpcDetailView.vue"),
                beforeEnter: () => setMinSize(320, 360),
            },
            {
                name: "rouge-list",
                path: "rouge",
                component: () => import("./views/DBRougeView.vue"),
                beforeEnter: () => setMinSize(320, 360),
                meta: { title: "database.rouge" },
            },
            {
                name: "rouge-detail",
                path: "rouge/:mode/:kind/:id",
                component: () => import("./views/DBRougeDetailView.vue"),
                beforeEnter: () => setMinSize(320, 360),
                meta: { title: "database.rouge" },
            },
            {
                name: "clue-list",
                path: "clue",
                component: () => import("./views/DBClueListView.vue"),
                beforeEnter: () => setMinSize(320, 360),
                meta: { title: "database.clue" },
            },
            {
                name: "clue-detail",
                path: "clue/:id",
                component: () => import("./views/DBClueDetailView.vue"),
                beforeEnter: () => setMinSize(320, 360),
                meta: { title: "database.clue" },
            },
            {
                name: "review-list",
                path: "review",
                component: () => import("./views/DBReviewListView.vue"),
                beforeEnter: () => setMinSize(320, 360),
                meta: { title: "database.review" },
            },
            {
                name: "review-detail",
                path: "review/:id",
                component: () => import("./views/DBReviewDetailView.vue"),
                beforeEnter: () => setMinSize(320, 360),
                meta: { title: "database.review" },
            },
            {
                name: "wiki-list",
                path: "wiki",
                component: () => import("./views/DBWikiListView.vue"),
                beforeEnter: () => setMinSize(320, 360),
                meta: { title: "database.wiki" },
            },
            {
                name: "trait-list",
                path: "trait",
                component: () => import("./views/DBTraitListView.vue"),
                beforeEnter: () => setMinSize(320, 360),
            },
            {
                name: "trait-detail",
                path: "trait/:name",
                component: () => import("./views/DBTraitDetailView.vue"),
                beforeEnter: () => setMinSize(320, 360),
            },
            {
                name: "wiki-detail",
                path: "wiki/:id",
                component: () => import("./views/DBWikiDetailView.vue"),
                beforeEnter: () => setMinSize(320, 360),
                meta: { title: "database.wiki" },
            },
        ],
    },
    // DNA routes
    {
        path: "/dna",
        children: [
            { name: "dna-home", path: "/dna", component: () => import("./views/DNAHomeView.vue"), beforeEnter: () => setMinSize(320, 360) },
            {
                name: "dna-role-detail",
                path: "char/:charId/:charEid",
                component: () => import("./views/DNARoleDetailView.vue"),
                beforeEnter: () => setMinSize(320, 360),
            },
            {
                name: "dna-weapon-detail",
                path: "weapon/:weaponId/:weaponEid",
                component: () => import("./views/DNAWeaponDetailView.vue"),
                beforeEnter: () => setMinSize(320, 360),
            },
            {
                name: "dna-mine",
                path: "mine",
                component: () => import("./views/DNAUserMineView.vue"),
                beforeEnter: () => setMinSize(320, 360),
            },
            {
                name: "dna-user",
                path: "mine/:userId",
                component: () => import("./views/DNAUserMineView.vue"),
                beforeEnter: () => setMinSize(320, 360),
            },
            {
                name: "dna-posts",
                path: "posts/:forumId",
                component: () => import("./views/DNAPostListView.vue"),
                beforeEnter: () => setMinSize(320, 360),
            },
            {
                name: "dna-topic",
                path: "topic/:topicId",
                component: () => import("./views/DNAPostListView.vue"),
                beforeEnter: () => setMinSize(320, 360),
            },
            {
                name: "dna-post-detail",
                path: "posts/:forumId/:postId",
                component: () => import("./views/DNAPostDetailView.vue"),
                beforeEnter: () => setMinSize(320, 360),
            },
        ],
    },

    // 攻略 routes
    { name: "guide-list", path: "/guides", component: GuideListView, beforeEnter: () => setMinSize(320, 360) },
    { name: "guide-detail", path: "/guides/:id", component: GuideDetailView, beforeEnter: () => setMinSize(320, 360) },
    { name: "guide-create", path: "/guides/create", component: GuideEditView, beforeEnter: () => setMinSize(320, 360) },
    { name: "guide-edit", path: "/guides/:id/edit", component: GuideEditView, beforeEnter: () => setMinSize(320, 360) },

    // 脚本 routes
    // 脚本页面不依赖游戏数据包，通过 meta.requireData = false 跳过数据包更新/安装提示与数据包水合等待
    {
        name: "script-list",
        path: "/scripts",
        component: () => import("./views/ScriptListView.vue"),
        beforeEnter: () => setMinSize(320, 360),
        meta: { requireData: false },
    },
    {
        name: "script-color-tool",
        path: "/scripts/color-tool",
        component: () => import("./views/ScriptColorToolView.vue"),
        beforeEnter: () => setMinSize(320, 360),
        meta: { requireData: false },
    },
    {
        name: "script-record-tool",
        path: "/scripts/record-tool",
        component: () => import("./views/ScriptRecordToolView.vue"),
        beforeEnter: () => setMinSize(320, 360),
        meta: { requireData: false },
    },

    // 404 页面 - 必须放在最后作为捕获所有未匹配路由
    {
        path: "/:pathMatch(.*)*",
        name: "notfound",
        component: NotFound,
        beforeEnter: () => setMinSize(320, 360),
        meta: { requireData: false },
    },
]

export const router = createRouter({
    // 应用内使用 hash 模式，其他环境使用 history 模式；无 window 时（单测 / 纯 Node 引用）退化为 memory 模式，避免模块加载直接抛错
    history: env.isApp ? createWebHashHistory() : typeof window === "undefined" ? createMemoryHistory() : createWebHistory(),
    routes,
})

/**
 * 旧升华 `?tab=&id=` 链接的兜底归一化。
 * layout 的 beforeEnter 只在首次进入父记录时触发，query-only 导航（如从子路由回到总览）不会经过它，
 * 因此收口到全局守卫：仅总览路由承接，子路由带 `tab` 时路径优先直接放行。
 * SSG 预渲染自行建 router，不注册本守卫；预渲染不携带 query，无影响。
 * @param target 要安装守卫的 router 实例
 */
export function installTranscendenceLegacyGuard(target: Router): void {
    target.beforeEach(to => {
        if (to.name !== "transcendence" || !("tab" in to.query)) {
            return true
        }

        return resolveLegacyTranscendenceRoute(to) ?? true
    })
}

installTranscendenceLegacyGuard(router)
