import { L, type Tutorial } from "../types"

export const modsTutorial: Tutorial = {
    id: "mods",
    number: "10",
    category: "desktop",
    title: L("游戏 MOD", "遊戲 MOD", "Game MODs", "ゲームMOD", "게임 MOD", "MOD de jeu"),
    subtitle: L(
        "商店逛、桌面装、启动器开。",
        "商店逛、桌面裝、啟動器開。",
        "Browse the store, install on desktop, enable in the launcher.",
        "ストアで探し、デスクトップで導入、ランチャーで有効化。",
        "상점에서 찾고, 데스크톱에서 설치하고, 런처에서 켭니다.",
        "Parcourez la boutique, installez sur le bureau, activez dans le lanceur."
    ),
    summary: L(
        "先分清：这里的 MOD 是游戏补丁，不是构筑里的魔之楔。网页端只逛分享商店；桌面端负责本地管理、导入与下载队列；最后用两步启用，再了解发布与审核。",
        "先分清：這裡的 MOD 是遊戲補丁，不是構築裡的魔之楔。網頁端只逛分享商店；桌面端負責本機管理、匯入與下載佇列；最後用兩步啟用，再了解發佈與審核。",
        "First, MOD here means a game patch, not the build's Mods. The web only browses the share store; desktop handles local management, imports, and the download queue. Enable in two steps, then learn publishing and review.",
        "まず区別：ここでのMODはゲームパッチで、構築の魔之楔ではありません。Webは共有ストアのみ、デスクトップがローカル管理・取り込み・ダウンロードキューを担当。最後に2ステップの有効化と公開・審査を学びます。",
        "먼저 구분하세요. 여기서 MOD는 게임 패치이며 빌드의 악마의 쐐기(魔之楔)가 아닙니다. 웹은 공유 상점만 보고, 데스크톱이 로컬 관리, 가져오기, 다운로드 큐를 담당합니다. 두 단계 활성화와 게시/검수를 배웁니다.",
        "D'abord, MOD signifie ici un patch de jeu, pas les mods de construction. Le web ne fait que parcourir la boutique ; le bureau gère le local, les imports et la file de téléchargement. Activation en deux étapes, puis publication et validation."
    ),
    icon: "ri:puzzle-line",
    accent: "#a855f7",
    route: "/mods",
    routeLabel: L("打开 MOD 商店", "開啟 MOD 商店", "Open MOD store", "MODストアを開く", "MOD 상점 열기", "Ouvrir la boutique"),
    platforms: ["web", "app", "login"],
    scenes: [
        {
            id: "intro",
            chapter: L("开场", "開場", "Intro", "導入", "인트로", "Intro"),
            duration: 5,
            shot: {
                type: "title",
                variant: "intro",
                kicker: L(
                    "EP 10 · 桌面端",
                    "EP 10 · 桌面端",
                    "EP 10 · DESKTOP",
                    "EP 10 · デスクトップ",
                    "EP 10 · 데스크톱",
                    "EP 10 · BUREAU"
                ),
                title: L("游戏 MOD", "遊戲 MOD", "Game MODs", "ゲームMOD", "게임 MOD", "MOD de jeu"),
                subtitle: L(
                    "不是魔之楔，是游戏补丁。",
                    "不是魔之楔，是遊戲補丁。",
                    "Not the build's Mods: game patches.",
                    "魔之楔ではなくゲームパッチ。",
                    "악마의 쐐기가 아닌 게임 패치.",
                    "Pas les mods de build : des patchs de jeu."
                ),
                icon: "ri:puzzle-line",
                index: "10",
            },
            captions: [
                {
                    at: 0.9,
                    text: L(
                        "这里的 MOD 是游戏补丁，不是构筑里的魔之楔。",
                        "這裡的 MOD 是遊戲補丁，不是構築裡的魔之楔。",
                        "Here MOD means a game patch, not the build's Mods.",
                        "ここでのMODはゲームパッチで、構築の魔之楔ではありません。",
                        "여기서 MOD는 게임 패치이며 빌드의 악마의 쐐기가 아닙니다.",
                        "Ici, MOD désigne un patch de jeu, pas les mods de construction."
                    ),
                },
            ],
        },
        {
            id: "store",
            chapter: L("分享商店", "分享商店", "Share store", "共有ストア", "공유 상점", "Boutique"),
            duration: 9.5,
            shot: {
                type: "cards",
                kicker: "MOD SHARE",
                title: L("MOD 分享商店", "MOD 分享商店", "MOD share store", "MOD共有ストア", "MOD 공유 상점", "Boutique de MOD"),
                variant: "gallery",
                toolbar: {
                    search: L("搜索 MOD...", "搜尋 MOD...", "Search MODs...", "MODを検索...", "MOD 검색...", "Rechercher un MOD..."),
                    tabs: [
                        L("全部", "全部", "All", "すべて", "전체", "Tous"),
                        L("分类", "分類", "Category", "カテゴリ", "분류", "Catégorie"),
                        L("全部角色", "全部角色", "All characters", "全キャラ", "모든 캐릭터", "Tous personnages"),
                    ],
                    activeTab: 0,
                    actions: [
                        L("最新", "最新", "Newest", "新着", "최신", "Récents"),
                        L("我的发布", "我的發佈", "My posts", "マイ投稿", "내 게시물", "Mes publications"),
                    ],
                },
                items: [
                    {
                        title: L(
                            "赛琪 · 极光礼服",
                            "賽琪 · 極光禮服",
                            "Saiqi · Aurora Dress",
                            "サイキ・オーロラドレス",
                            "사이치 · 오로라 드레스",
                            "Saiqi · Robe aurore"
                        ),
                        subtitle: L(
                            "角色 MOD · v2.1.0",
                            "角色 MOD · v2.1.0",
                            "Character MOD · v2.1.0",
                            "キャラMOD・v2.1.0",
                            "캐릭터 MOD · v2.1.0",
                            "MOD de personnage · v2.1.0"
                        ),
                        tag: L(
                            "原创 · 推荐",
                            "原創 · 推薦",
                            "Original · featured",
                            "オリジナル・推薦",
                            "창작 · 추천",
                            "Original · en avant"
                        ),
                        meta: L(
                            "浏览 3.2k · 下载 840",
                            "瀏覽 3.2k · 下載 840",
                            "3.2k views · 840 downloads",
                            "閲覧3.2k・DL 840",
                            "조회 3.2k · 다운로드 840",
                            "3,2k vues · 840 téléchargements"
                        ),
                        accent: "#c084fc",
                    },
                    {
                        title: L(
                            "黎瑟 · 黑金剑鞘",
                            "黎瑟 · 黑金劍鞘",
                            "Lise · Black Gold Scabbard",
                            "リーゼ・黒金の鞘",
                            "리제 · 흑금 칼집",
                            "Lise · Fourreau noir et or"
                        ),
                        subtitle: L(
                            "武器 MOD · v1.4.0",
                            "武器 MOD · v1.4.0",
                            "Weapon MOD · v1.4.0",
                            "武器MOD・v1.4.0",
                            "무기 MOD · v1.4.0",
                            "MOD d'arme · v1.4.0"
                        ),
                        tag: L("转载", "轉載", "Repost", "転載", "재게시", "Repartagé"),
                        meta: L(
                            "浏览 2.1k · 下载 510",
                            "瀏覽 2.1k · 下載 510",
                            "2.1k views · 510 downloads",
                            "閲覧2.1k・DL 510",
                            "조회 2.1k · 다운로드 510",
                            "2,1k vues · 510 téléchargements"
                        ),
                        accent: "#fbbf24",
                    },
                    {
                        title: L(
                            "贝蕾妮卡 · 旅人披风",
                            "貝蕾妮卡 · 旅人披風",
                            "Berenica · Traveler Cloak",
                            "ベレニカ・旅人のマント",
                            "베레니카 · 여행자 망토",
                            "Berenica · Cape de voyage"
                        ),
                        subtitle: L(
                            "角色 MOD · v1.8.0",
                            "角色 MOD · v1.8.0",
                            "Character MOD · v1.8.0",
                            "キャラMOD・v1.8.0",
                            "캐릭터 MOD · v1.8.0",
                            "MOD de personnage · v1.8.0"
                        ),
                        tag: L("原创", "原創", "Original", "オリジナル", "창작", "Original"),
                        meta: L(
                            "浏览 1.7k · 下载 460",
                            "瀏覽 1.7k · 下載 460",
                            "1.7k views · 460 downloads",
                            "閲覧1.7k・DL 460",
                            "조회 1.7k · 다운로드 460",
                            "1,7k vues · 460 téléchargements"
                        ),
                        accent: "#22c55e",
                    },
                    {
                        title: L(
                            "达芙涅 · 潮汐羽衣",
                            "達芙涅 · 潮汐羽衣",
                            "Daphne · Tide Robe",
                            "ダフネ・潮汐の羽衣",
                            "다프네 · 조수 깃옷",
                            "Daphné · Robe des marées"
                        ),
                        subtitle: L(
                            "角色 MOD · v1.2.0",
                            "角色 MOD · v1.2.0",
                            "Character MOD · v1.2.0",
                            "キャラMOD・v1.2.0",
                            "캐릭터 MOD · v1.2.0",
                            "MOD de personnage · v1.2.0"
                        ),
                        tag: L("转载", "轉載", "Repost", "転載", "재게시", "Repartagé"),
                        meta: L(
                            "浏览 1.5k · 下载 390",
                            "瀏覽 1.5k · 下載 390",
                            "1.5k views · 390 downloads",
                            "閲覧1.5k・DL 390",
                            "조회 1.5k · 다운로드 390",
                            "1,5k vues · 390 téléchargements"
                        ),
                        accent: "#38bdf8",
                    },
                    {
                        title: L(
                            "卡嘉 · 余烬重甲",
                            "卡嘉 · 餘燼重甲",
                            "Kaja · Ember Armor",
                            "カジャ・残り火の重鎧",
                            "카자 · 잔불 중갑",
                            "Kaja · Armure de braise"
                        ),
                        subtitle: L(
                            "角色 MOD · v2.0.0",
                            "角色 MOD · v2.0.0",
                            "Character MOD · v2.0.0",
                            "キャラMOD・v2.0.0",
                            "캐릭터 MOD · v2.0.0",
                            "MOD de personnage · v2.0.0"
                        ),
                        tag: L("原创", "原創", "Original", "オリジナル", "창작", "Original"),
                        meta: L(
                            "浏览 2.8k · 下载 720",
                            "瀏覽 2.8k · 下載 720",
                            "2.8k views · 720 downloads",
                            "閲覧2.8k・DL 720",
                            "조회 2.8k · 다운로드 720",
                            "2,8k vues · 720 téléchargements"
                        ),
                        accent: "#fb7185",
                    },
                    {
                        title: L(
                            "失乡的獠牙 · 武器外观",
                            "失鄉的獠牙 · 武器外觀",
                            "Fang of the Exile · Weapon Skin",
                            "失郷の牙・武器スキン",
                            "실향의 송곳니 · 무기 외형",
                            "Croc de l'exilé · Apparence"
                        ),
                        subtitle: L(
                            "武器 MOD · v1.0.0",
                            "武器 MOD · v1.0.0",
                            "Weapon MOD · v1.0.0",
                            "武器MOD・v1.0.0",
                            "무기 MOD · v1.0.0",
                            "MOD d'arme · v1.0.0"
                        ),
                        tag: L("原创 · 置顶", "原創 · 置頂", "Original · pinned", "オリジナル・固定", "창작 · 고정", "Original · épinglé"),
                        meta: L(
                            "浏览 4.1k · 下载 1.1k",
                            "瀏覽 4.1k · 下載 1.1k",
                            "4.1k views · 1.1k downloads",
                            "閲覧4.1k・DL 1.1k",
                            "조회 4.1k · 다운로드 1.1k",
                            "4,1k vues · 1,1k téléchargements"
                        ),
                        accent: "#a78bfa",
                    },
                ],
                columns: 3,
                highlight: 0,
                highlightAt: 2.4,
                highlightLabel: L("打开详情", "開啟詳情", "Open details", "詳細を開く", "상세 열기", "Ouvrir"),
                footnote: L(
                    "每页 30 条 · 搜索 / 分类 / 角色筛选",
                    "每頁 30 條 · 搜尋 / 分類 / 角色篩選",
                    "30 per page · search / category / character filters",
                    "1ページ30件・検索 / 分類 / キャラ絞り込み",
                    "페이지당 30개 · 검색 / 분류 / 캐릭터 필터",
                    "30 par page · recherche / catégorie / personnage"
                ),
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "商店每页 30 条，可搜索、按分类和角色筛选。",
                        "商店每頁 30 條，可搜尋、按分類和角色篩選。",
                        "Thirty MODs per page, with search, category, and character filters.",
                        "1ページ30件。検索・カテゴリ・キャラで絞り込めます。",
                        "페이지당 30개이며 검색, 분류, 캐릭터 필터를 지원합니다.",
                        "Trente MODs par page, avec recherche, catégorie et personnage."
                    ),
                },
                {
                    at: 5,
                    text: L(
                        "卡片标出原创/转载、推荐/置顶，以及浏览与下载量。",
                        "卡片標出原創/轉載、推薦/置頂，以及瀏覽與下載量。",
                        "Cards show original/repost, featured/pinned, and view/download counts.",
                        "カードにはオリジナル／転載、推薦／固定、閲覧数とDL数。",
                        "카드에 창작/재게시, 추천/고정, 조회·다운로드 수가 표시됩니다.",
                        "Les cartes affichent original/repartage, mise en avant, vues et téléchargements."
                    ),
                },
            ],
            callouts: [
                {
                    at: 2.4,
                    text: L(
                        "搜索 / 分类 / 角色",
                        "搜尋 / 分類 / 角色",
                        "Search / category / character",
                        "検索 / 分類 / キャラ",
                        "검색 / 분류 / 캐릭터",
                        "Recherche / catégorie / personnage"
                    ),
                    x: 24,
                    y: 22,
                },
                {
                    at: 6.8,
                    text: L(
                        "原创 / 转载",
                        "原創 / 轉載",
                        "Original / repost",
                        "オリジナル / 転載",
                        "창작 / 재게시",
                        "Original / repartage"
                    ),
                    x: 70,
                    y: 45,
                },
            ],
            cursor: {
                at: 1.2,
                path: [
                    [45, 20],
                    [38, 34],
                    [30, 48],
                    [28, 55],
                ],
                clickAt: 2.4,
            },
        },
        {
            id: "detail",
            chapter: L(
                "详情与下载",
                "詳情與下載",
                "Detail & download",
                "詳細とダウンロード",
                "상세와 다운로드",
                "Détail et téléchargement"
            ),
            duration: 9,
            shot: {
                type: "modal",
                title: L("MOD 详情", "MOD 詳情", "MOD details", "MOD詳細", "MOD 상세", "Détails du MOD"),
                description: L(
                    "封面、预览轮播、版本列表和下载入口都在这一页。",
                    "封面、預覽輪播、版本列表和下載入口都在這一頁。",
                    "Cover, preview carousel, version list, and download entry are all here.",
                    "カバー、プレビュー、バージョン一覧、ダウンロード入口がこのページに。",
                    "커버, 미리보기 캐러셀, 버전 목록, 다운로드 진입점이 한 페이지에 있습니다.",
                    "Couverture, carrousel, liste des versions et téléchargement sur une page."
                ),
                fields: [
                    {
                        label: L("最新版本", "最新版本", "Latest version", "最新版", "최신 버전", "Dernière version"),
                        value: L("v2.1.0", "v2.1.0", "v2.1.0", "v2.1.0", "v2.1.0", "v2.1.0"),
                    },
                    {
                        label: L("已安装", "已安裝", "Installed", "インストール済み", "설치됨", "Installé"),
                        value: L(
                            "v2.0.0 · 可更新",
                            "v2.0.0 · 可更新",
                            "v2.0.0 · updatable",
                            "v2.0.0・更新可",
                            "v2.0.0 · 업데이트 가능",
                            "v2.0.0 · mise à jour dispo"
                        ),
                    },
                    {
                        label: L("预览图", "預覽圖", "Previews", "プレビュー", "미리보기", "Aperçus"),
                        value: L("6 / 9", "6 / 9", "6 / 9", "6 / 9", "6 / 9", "6 / 9"),
                    },
                    {
                        label: L("来源", "來源", "Source", "出典", "출처", "Source"),
                        value: L(
                            "转载 · 已附原帖",
                            "轉載 · 已附原帖",
                            "Repost · source linked",
                            "転載・元記事あり",
                            "재게시 · 원문 링크",
                            "Repartage · source liée"
                        ),
                    },
                ],
                actions: [
                    L("关闭", "關閉", "Close", "閉じる", "닫기", "Fermer"),
                    L(
                        "下载最新版本",
                        "下載最新版本",
                        "Download latest",
                        "最新版をダウンロード",
                        "최신 버전 다운로드",
                        "Télécharger la dernière"
                    ),
                ],
                result: {
                    title: L("版本列表", "版本列表", "Version list", "バージョン一覧", "버전 목록", "Versions"),
                    value: "v2.1.0 · v2.0.0 · v1.9.0",
                    hint: L(
                        "最新 / 已安装 / 可更新 三种标记",
                        "最新 / 已安裝 / 可更新 三種標記",
                        "Latest / installed / updatable badges",
                        "最新 / 導入済み / 更新可 の3種",
                        "최신 / 설치됨 / 업데이트 가능 표시",
                        "Badges dernière / installée / à jour"
                    ),
                },
                confirmAt: 2,
                resultAt: 3.2,
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "详情页有封面、预览轮播和版本列表；按版本或直接下最新版。",
                        "詳情頁有封面、預覽輪播和版本列表；按版本或直接下最新版。",
                        "Details hold the cover, preview carousel, and version list; pick a version or download latest.",
                        "詳細にはカバー、プレビュー、バージョン一覧。版指定か最新版をダウンロード。",
                        "상세에는 커버, 미리보기, 버전 목록이 있으며 버전별 또는 최신 버전을 받을 수 있습니다.",
                        "La page contient couverture, aperçus et versions ; choisissez une version ou la dernière."
                    ),
                },
                {
                    at: 4.6,
                    text: L(
                        "登录后才能下载；版本列表会标出最新、已安装和可更新。",
                        "登入後才能下載；版本列表會標出最新、已安裝和可更新。",
                        "Login is required to download; versions are marked latest, installed, or updatable.",
                        "ダウンロードにはログインが必要。バージョン一覧に最新・導入済み・更新可が表示されます。",
                        "다운로드하려면 로그인해야 하며, 버전 목록에 최신/설치됨/업데이트 가능이 표시됩니다.",
                        "La connexion est requise ; les versions indiquent dernière, installée ou à jour."
                    ),
                },
            ],
            note: L(
                "需登录 · 安装仅桌面端",
                "需登入 · 安裝僅桌面端",
                "Login · desktop install",
                "ログイン・導入はデスクトップのみ",
                "로그인 · 데스크톱 설치 전용",
                "Connexion · installation bureau"
            ),
            cursor: {
                at: 1.2,
                path: [
                    [62, 66],
                    [66, 70],
                    [69, 72],
                ],
                clickAt: 1.8,
            },
        },
        {
            id: "web-limit",
            chapter: L("平台差异", "平台差異", "Platform limits", "プラットフォーム差", "플랫폼 차이", "Différences de plateforme"),
            duration: 7.5,
            shot: {
                type: "callout",
                kicker: "WEB ≠ DESKTOP",
                title: L(
                    "Web 能逛，不能装",
                    "Web 能逛，不能裝",
                    "Browse on web, install on desktop",
                    "Webは見るだけ、導入はデスクトップ",
                    "웹은 둘러보기, 설치는 데스크톱",
                    "Naviguer sur le web, installer sur le bureau"
                ),
                icon: "ri:error-warning-line",
                points: [
                    {
                        text: L(
                            "网页端的 /mods 只是分享商店，下载安装仅桌面客户端可用。",
                            "網頁端的 /mods 只是分享商店，下載安裝僅桌面用戶端可用。",
                            "On the web, /mods is only the share store; download and install require the desktop app.",
                            "Webの/modsは共有ストアのみ。ダウンロードと導入はデスクトップ版のみです。",
                            "웹의 /mods는 공유 상점일 뿐이며, 다운로드와 설치는 데스크톱 앱에서만 가능합니다.",
                            "Sur le web, /mods n'est que la boutique ; téléchargement et installation exigent l'application bureau."
                        ),
                    },
                    {
                        text: L(
                            "安装需要登录，并先配置好游戏路径。",
                            "安裝需要登入，並先設定好遊戲路徑。",
                            "Installing requires login and a configured game path.",
                            "導入にはログインとゲームパスの設定が必要です。",
                            "설치하려면 로그인과 게임 경로 설정이 필요합니다.",
                            "L'installation exige une connexion et un chemin de jeu configuré."
                        ),
                    },
                    {
                        text: L(
                            "桌面端才有本地管理、导入、启停和下载队列。",
                            "桌面端才有本機管理、匯入、啟停和下載佇列。",
                            "Only desktop has local management, imports, enable/disable, and the download queue.",
                            "ローカル管理・取り込み・有効化・ダウンロードキューはデスクトップのみ。",
                            "로컬 관리, 가져오기, 활성화/비활성화, 다운로드 큐는 데스크톱에만 있습니다.",
                            "Seul le bureau a la gestion locale, les imports, l'activation et la file de téléchargement."
                        ),
                    },
                ],
                note: L(
                    "记住这条硬限制",
                    "記住這條硬限制",
                    "One hard limit to remember",
                    "この制約を覚えて",
                    "이 제한을 기억하세요",
                    "Une limite à retenir"
                ),
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "网页端只能浏览分享商店，下载与安装入口只在桌面端。",
                        "網頁端只能瀏覽分享商店，下載與安裝入口只在桌面端。",
                        "The web only browses the share store; download and install live on desktop.",
                        "Webは共有ストアの閲覧のみ。ダウンロードと導入はデスクトップだけです。",
                        "웹은 공유 상점을 둘러볼 뿐이며 다운로드와 설치는 데스크톱에만 있습니다.",
                        "Le web ne fait que parcourir la boutique ; téléchargement et installation sont sur le bureau."
                    ),
                },
                {
                    at: 4.4,
                    text: L(
                        "桌面端才能本地管理、启停与排队安装。",
                        "桌面端才能本機管理、啟停與排隊安裝。",
                        "Only desktop can manage locally, toggle, and queue installs.",
                        "デスクトップだけがローカル管理・有効化・導入キューに対応します。",
                        "데스크톱에서만 로컬 관리, 활성화, 설치 대기열을 쓸 수 있습니다.",
                        "Seul le bureau gère le local, active/désactive et met en file les installations."
                    ),
                },
            ],
            note: L("平台差异", "平台差異", "Platform difference", "プラットフォーム差", "플랫폼 차이", "Différence de plateforme"),
        },
        {
            id: "local-tabs",
            chapter: L("本地管理", "本機管理", "Local management", "ローカル管理", "로컬 관리", "Gestion locale"),
            duration: 10,
            shot: {
                type: "cards",
                kicker: "LOCAL MODS",
                title: L(
                    "桌面端的五个 tab",
                    "桌面端的五個 tab",
                    "Five desktop tabs",
                    "デスクトップの5タブ",
                    "데스크톱의 다섯 탭",
                    "Cinq onglets desktop"
                ),
                variant: "tiles",
                items: [
                    {
                        title: L("分享", "分享", "Share", "共有", "공유", "Partager"),
                        subtitle: L(
                            "在线商店、我的发布与下载队列",
                            "線上商店、我的發佈與下載佇列",
                            "Store, my posts, and download queue",
                            "ストア・マイ投稿・DLキュー",
                            "상점, 내 게시물, 다운로드 큐",
                            "Boutique, publications et file"
                        ),
                        icon: "ri:shopping-bag-4-line",
                    },
                    {
                        title: L("角色", "角色", "Character", "キャラ", "캐릭터", "Personnage"),
                        subtitle: L(
                            "一个角色只能选一个 MOD，含「无MOD」",
                            "一個角色只能選一個 MOD，含「無MOD」",
                            "One MOD per character, including None",
                            "1キャラ1 MOD、「MODなし」あり",
                            "캐릭터 하나에 MOD 하나, '없음' 포함",
                            "Un MOD par personnage, dont « aucun »"
                        ),
                        icon: "ri:user-line",
                    },
                    {
                        title: L("武器", "武器", "Weapon", "武器", "무기", "Arme"),
                        subtitle: L(
                            "一个武器只能选一个 MOD，含「无MOD」",
                            "一個武器只能選一個 MOD，含「無MOD」",
                            "One MOD per weapon, including None",
                            "1武器1 MOD、「MODなし」あり",
                            "무기 하나에 MOD 하나, '없음' 포함",
                            "Un MOD par arme, dont « aucun »"
                        ),
                        icon: "ri:sword-line",
                    },
                    {
                        title: L("自定义", "自訂", "Custom", "カスタム", "사용자 정의", "Personnalisé"),
                        subtitle: L(
                            "自建实体，同样单选",
                            "自建實體，同樣單選",
                            "Custom entities, also single-select",
                            "自作エンティティも単一選択",
                            "직접 만든 항목도 단일 선택",
                            "Entités personnalisées, aussi uniques"
                        ),
                        icon: "ri:apps-2-line",
                    },
                    {
                        title: L("独立", "獨立", "Standalone", "独立", "독립", "Autonome"),
                        subtitle: L(
                            "多选，可同时启用",
                            "多選，可同時啟用",
                            "Multi-select, enable several",
                            "複数選択で同時有効",
                            "다중 선택, 동시 활성화",
                            "Sélection multiple"
                        ),
                        icon: "ri:stack-line",
                    },
                ],
                columns: 5,
                highlight: 4,
                highlightAt: 5.8,
                highlightLabel: L("可多选", "可多選", "Multi-select", "複数選択", "다중 선택", "Choix multiple"),
                footnote: L(
                    "拖入 zip 导入 · 删除 · 预览",
                    "拖入 zip 匯入 · 刪除 · 預覽",
                    "Drag in a zip · delete · preview",
                    "zipをドラッグで取り込み・削除・プレビュー",
                    "zip 드래그 가져오기 · 삭제 · 미리보기",
                    "Glisser un zip · supprimer · aperçu"
                ),
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "角色、武器、自定义是单选：一个实体只能挂一个 MOD。",
                        "角色、武器、自訂是單選：一個實體只能掛一個 MOD。",
                        "Character, weapon, and custom are single-select: one entity, one MOD.",
                        "キャラ・武器・カスタムは単一選択。1実体につき1 MODです。",
                        "캐릭터, 무기, 사용자 정의는 단일 선택으로 한 항목에 MOD 하나입니다.",
                        "Personnage, arme et personnalisé : une entité, un MOD."
                    ),
                },
                {
                    at: 4.8,
                    text: L(
                        "独立 MOD 是多选；拖入 zip 导入后默认禁用。",
                        "獨立 MOD 是多選；拖入 zip 匯入後預設停用。",
                        "Standalone MODs are multi-select; a dragged zip imports disabled.",
                        "独立MODは複数選択。zipを取り込むと既定で無効です。",
                        "독립 MOD는 다중 선택이며, zip을 끌어오면 기본 비활성으로 가져옵니다.",
                        "Les MOD autonomes se cumulent ; un zip importé reste désactivé."
                    ),
                },
            ],
            callouts: [
                {
                    at: 2.6,
                    text: L(
                        "实体单选 · 含无MOD",
                        "實體單選 · 含無MOD",
                        "Entity: single, incl. None",
                        "実体は単一・なし含む",
                        "엔티티 단일 · 없음 포함",
                        "Entité : unique, dont aucun"
                    ),
                    x: 36,
                    y: 45,
                },
                {
                    at: 6.8,
                    text: L("独立多选", "獨立多選", "Standalone: multi", "独立は複数", "독립 다중", "Autonome : multiple"),
                    x: 82,
                    y: 45,
                },
            ],
            note: L("仅桌面端", "僅桌面端", "Desktop only", "デスクトップのみ", "데스크톱 전용", "Bureau uniquement"),
        },
        {
            id: "download-queue",
            chapter: L("下载队列", "下載佇列", "Download queue", "ダウンロードキュー", "다운로드 큐", "File de téléchargement"),
            duration: 9,
            shot: {
                type: "steps",
                kicker: "DOWNLOAD QUEUE",
                title: L(
                    "从下载到安装",
                    "從下載到安裝",
                    "From download to install",
                    "ダウンロードから導入まで",
                    "다운로드에서 설치까지",
                    "Du téléchargement à l'installation"
                ),
                steps: [
                    {
                        icon: "ri:user-line",
                        title: L(
                            "登录 + 游戏路径",
                            "登入 + 遊戲路徑",
                            "Login + game path",
                            "ログイン＋ゲームパス",
                            "로그인 + 게임 경로",
                            "Connexion + chemin"
                        ),
                        desc: L(
                            "缺一不可，否则任务直接报错。",
                            "缺一不可，否則任務直接報錯。",
                            "Both are required, or the task errors out.",
                            "どちらも必須。ないとタスクがエラーになります。",
                            "둘 다 필요하며 없으면 작업이 오류납니다.",
                            "Les deux sont requis, sinon la tâche échoue."
                        ),
                    },
                    {
                        icon: "ri:list-check-3",
                        title: L("入队", "排入佇列", "Queued", "キュー投入", "대기열 추가", "En file"),
                        desc: L(
                            "全局串行，一次只处理一个任务。",
                            "全域串行，一次只處理一個任務。",
                            "Global serial queue: one task at a time.",
                            "全体で直列、一度に1タスク。",
                            "전역 직렬, 한 번에 하나.",
                            "File globale : une tâche à la fois."
                        ),
                    },
                    {
                        icon: "ri:download-line",
                        title: L(
                            "下载并安装",
                            "下載並安裝",
                            "Download & install",
                            "ダウンロードと導入",
                            "다운로드 및 설치",
                            "Télécharger et installer"
                        ),
                        desc: L(
                            "进度只增不退，可取消或重试。",
                            "進度只增不退，可取消或重試。",
                            "Progress only increases; cancel or retry.",
                            "進捗は戻らず、キャンセルや再試行が可能。",
                            "진행률은 줄지 않으며 취소/재시도 가능.",
                            "Progression monotone, annulation et reprise possibles."
                        ),
                    },
                    {
                        icon: "ri:checkbox-circle-line",
                        title: L("完成", "完成", "Done", "完了", "완료", "Terminé"),
                        desc: L(
                            "任务保留 4 秒后消失，旧版本会被替换。",
                            "任務保留 4 秒後消失，舊版本會被替換。",
                            "Tasks vanish after 4 seconds; old versions are replaced.",
                            "タスクは4秒後に消え、旧版は置き換わります。",
                            "작업은 4초 후 사라지고 이전 버전은 교체됩니다.",
                            "La tâche disparaît après 4 s ; l'ancienne version est remplacée."
                        ),
                    },
                ],
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "下载需登录并配置游戏路径；队列全局串行。",
                        "下載需登入並設定遊戲路徑；佇列全域串行。",
                        "Downloading needs login and a game path; the queue is globally serial.",
                        "ダウンロードにはログインとゲームパスが必要。キューは全体で直列です。",
                        "다운로드에는 로그인과 게임 경로가 필요하며 큐는 전역 직렬입니다.",
                        "Télécharger exige connexion et chemin ; la file est globale et séquentielle."
                    ),
                },
                {
                    at: 4.6,
                    text: L(
                        "进度单调不回退；可取消或重试，完成 4 秒后消失。",
                        "進度單調不回退；可取消或重試，完成 4 秒後消失。",
                        "Progress never goes backwards; cancel or retry, and done tasks vanish after 4 seconds.",
                        "進捗は戻りません。キャンセル・再試行ができ、完了後4秒で消えます。",
                        "진행률은 되돌아가지 않으며 취소/재시도가 가능하고 완료 후 4초 뒤 사라집니다.",
                        "La progression ne recule pas ; annulez ou réessayez, la tâche disparaît après 4 s."
                    ),
                },
            ],
            note: L(
                "需登录 · 仅桌面端",
                "需登入 · 僅桌面端",
                "Login · desktop only",
                "ログイン・デスクトップのみ",
                "로그인 · 데스크톱 전용",
                "Connexion · bureau uniquement"
            ),
        },
        {
            id: "publish",
            chapter: L("发布", "發佈", "Publish", "公開", "게시", "Publier"),
            duration: 9.5,
            shot: {
                type: "modal",
                title: L("发布 MOD", "發佈 MOD", "Publish a MOD", "MODを公開", "MOD 게시", "Publier un MOD"),
                description: L(
                    "发布进入 pending 审核，通过后才出现在公开列表。",
                    "發佈進入 pending 審核，通過後才出現在公開列表。",
                    "Publishing enters pending review; it appears publicly only after approval.",
                    "公開するとpending審査に入り、承認後に一覧へ表示されます。",
                    "게시하면 pending 검수로 들어가며 승인 후에 공개 목록에 나타납니다.",
                    "La publication passe en revue pending et n'apparaît qu'après validation."
                ),
                fields: [
                    {
                        label: L("分类", "分類", "Category", "カテゴリ", "분류", "Catégorie"),
                        value: L(
                            "角色 · 赛琪",
                            "角色 · 賽琪",
                            "Character · Saiqi",
                            "キャラ・サイキ",
                            "캐릭터 · 사이치",
                            "Personnage · Saiqi"
                        ),
                    },
                    {
                        label: L("版本", "版本", "Version", "バージョン", "버전", "Version"),
                        value: L("v2.1.0", "v2.1.0", "v2.1.0", "v2.1.0", "v2.1.0", "v2.1.0"),
                    },
                    {
                        label: L("更新说明", "更新說明", "Changelog", "更新内容", "변경 사항", "Nouveautés"),
                        value: L(
                            "修复裙摆穿模",
                            "修正裙襬穿模",
                            "Fixed skirt clipping",
                            "スカートのめり込みを修正",
                            "치맛자락 관통 수정",
                            "Correction du clipping de jupe"
                        ),
                    },
                    {
                        label: L("来源", "來源", "Source", "出典", "출처", "Source"),
                        value: L(
                            "转载 · 已附原帖",
                            "轉載 · 已附原帖",
                            "Repost · source linked",
                            "転載・元記事あり",
                            "재게시 · 원문 링크",
                            "Repartage · source liée"
                        ),
                    },
                ],
                options: [
                    {
                        label: L("原创", "原創", "Original", "オリジナル", "창작", "Original"),
                        desc: L(
                            "自己制作或拥有授权",
                            "自己製作或擁有授權",
                            "Made by you or licensed",
                            "自作または許諾あり",
                            "직접 제작 또는 권한 보유",
                            "Créé par vous ou autorisé"
                        ),
                        icon: "ri:user-line",
                    },
                    {
                        label: L("转载", "轉載", "Repost", "転載", "재게시", "Repartage"),
                        desc: L(
                            "非原创需填写来源",
                            "非原創需填寫來源",
                            "Non-original needs a source",
                            "非オリジナルは出典必須",
                            "창작이 아니면 출처 필요",
                            "Non original : source requise"
                        ),
                        icon: "ri:external-link-line",
                        active: true,
                    },
                ],
                actions: [
                    L("取消", "取消", "Cancel", "キャンセル", "취소", "Annuler"),
                    L("发布 MOD", "發佈 MOD", "Publish MOD", "MODを公開", "MOD 게시", "Publier le MOD"),
                ],
                result: {
                    title: L("审核状态", "審核狀態", "Review status", "審査状態", "검수 상태", "Statut de revue"),
                    value: "pending",
                    hint: L(
                        "可在「我的发布」查看",
                        "可在「我的發佈」查看",
                        "Check My posts",
                        "「マイ投稿」で確認",
                        "내 게시물에서 확인",
                        "Voir Mes publications"
                    ),
                },
                confirmAt: 2,
                resultAt: 3.2,
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "ZIP 内必须含 .pak；mod.json 与 preview.png 可选。",
                        "ZIP 內必須含 .pak；mod.json 與 preview.png 可選。",
                        "The ZIP must contain a .pak; mod.json and preview.png are optional.",
                        "ZIPには.pakが必須。mod.jsonとpreview.pngは任意です。",
                        "ZIP에는 .pak이 필수이며 mod.json과 preview.png는 선택입니다.",
                        "Le ZIP doit contenir un .pak ; mod.json et preview.png sont optionnels."
                    ),
                },
                {
                    at: 4.8,
                    text: L(
                        "转载必填来源；最多 9 张预览；发布后进入 pending 审核。",
                        "轉載必填來源；最多 9 張預覽；發佈後進入 pending 審核。",
                        "Reposts need a source; up to 9 previews; publishing enters pending review.",
                        "転載は出典必須。プレビューは最大9枚。公開後はpending審査です。",
                        "재게시는 출처 필수, 미리보기 최대 9장, 게시 후 pending 검수로 들어갑니다.",
                        "Repartage : source obligatoire ; 9 aperçus max ; puis revue pending."
                    ),
                },
            ],
            note: L("需登录", "需登入", "Login required", "ログインが必要", "로그인 필요", "Connexion requise"),
            cursor: {
                at: 1.2,
                path: [
                    [62, 68],
                    [65, 71],
                    [68, 72],
                ],
                clickAt: 1.8,
            },
        },
        {
            id: "enable",
            chapter: L("启用", "啟用", "Enabling", "有効化", "활성화", "Activation"),
            duration: 9,
            shot: {
                type: "callout",
                kicker: "TWO STEPS",
                title: L(
                    "导入之后，还要启用",
                    "匯入之後，還要啟用",
                    "Import is not enough",
                    "取り込んだ後も有効化が必要",
                    "가져온 뒤에도 활성화가 필요합니다",
                    "Importer ne suffit pas"
                ),
                icon: "ri:play-circle-line",
                points: [
                    {
                        text: L(
                            "拖入 zip 即导入，但默认禁用；.pak/.paks 启用，.kap/.kaps 禁用。",
                            "拖入 zip 即匯入，但預設停用；.pak/.paks 啟用，.kap/.kaps 停用。",
                            "Drag in a zip to import it disabled; .pak/.paks are enabled, .kap/.kaps disabled.",
                            "zipを取り込むと既定で無効。.pak/.paksが有効、.kap/.kapsが無効です。",
                            "zip을 끌어오면 기본 비활성이며, .pak/.paks는 활성, .kap/.kaps는 비활성입니다.",
                            "Un zip s'importe désactivé ; .pak/.paks actifs, .kap/.kaps désactivés."
                        ),
                    },
                    {
                        text: L(
                            "第一步在 MOD 管理页启用；第二步在启动器勾选「启用MOD」，下次启动生效。",
                            "第一步在 MOD 管理頁啟用；第二步在啟動器勾選「啟用MOD」，下次啟動生效。",
                            "Step one: enable it in MOD management. Step two: tick Enable MOD in the launcher; it applies on the next launch.",
                            "1つ目はMOD管理ページで有効化。2つ目はランチャーの「MODを有効化」にチェック。次回起動から反映されます。",
                            "첫째, MOD 관리 페이지에서 활성화. 둘째, 런처에서 MOD 사용을 체크하면 다음 실행부터 적용됩니다.",
                            "Un : activez dans la gestion des MOD. Deux : cochez Activer les MOD dans le lanceur ; effet au prochain lancement."
                        ),
                    },
                    {
                        text: L(
                            "使用引导每个浏览器只自动弹一次。",
                            "使用引導每個瀏覽器只自動彈一次。",
                            "The usage guide auto-opens once per browser.",
                            "使用ガイドはブラウザごとに一度だけ自動表示されます。",
                            "사용 안내는 브라우저마다 한 번만 자동 표시됩니다.",
                            "Le guide d'utilisation ne s'ouvre qu'une fois par navigateur."
                        ),
                    },
                ],
                note: L(
                    "两步都要做 · 仅桌面端",
                    "兩步都要做 · 僅桌面端",
                    "Both steps · desktop only",
                    "2ステップ必須・デスクトップのみ",
                    "두 단계 모두 · 데스크톱 전용",
                    "Deux étapes · bureau uniquement"
                ),
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "导入默认禁用；.pak/.paks 启用，.kap/.kaps 禁用。",
                        "匯入預設停用；.pak/.paks 啟用，.kap/.kaps 停用。",
                        "Imports start disabled; .pak/.paks enable, .kap/.kaps disable.",
                        "取り込みは既定で無効。.pak/.paksが有効、.kap/.kapsが無効です。",
                        "가져오기는 기본 비활성이며 .pak/.paks는 켜고 .kap/.kaps는 끕니다.",
                        "Un import démarre désactivé ; .pak/.paks activent, .kap/.kaps désactivent."
                    ),
                },
                {
                    at: 4.8,
                    text: L(
                        "管理页启用 + 启动器勾选启用MOD，两步都要做。",
                        "管理頁啟用 + 啟動器勾選啟用MOD，兩步都要做。",
                        "Enable in management, then tick Enable MOD in the launcher. Both steps.",
                        "管理ページで有効化＋ランチャーでMOD有効化。両方必要です。",
                        "관리 페이지 활성화 + 런처 MOD 사용 체크, 두 단계 모두 필요합니다.",
                        "Activez dans la gestion, puis cochez Activer les MOD. Les deux."
                    ),
                },
            ],
            note: L("仅桌面端", "僅桌面端", "Desktop only", "デスクトップのみ", "데스크톱 전용", "Bureau uniquement"),
        },
        {
            id: "recap",
            chapter: L("回顾", "回顧", "Recap", "まとめ", "정리", "Récapitulatif"),
            duration: 9,
            shot: {
                type: "recap",
                title: L(
                    "商店找，桌面装，启动器开",
                    "商店找，桌面裝，啟動器開",
                    "Find, install, enable",
                    "探す・導入・有効化",
                    "찾고, 설치하고, 켜기",
                    "Trouver, installer, activer"
                ),
                checklist: [
                    L(
                        "商店 30/页，详情看版本与预览",
                        "商店 30/頁，詳情看版本與預覽",
                        "Store: 30 per page; details show versions and previews",
                        "ストアは1ページ30件、詳細で版とプレビュー",
                        "상점은 페이지당 30개, 상세에서 버전과 미리보기",
                        "Boutique : 30 par page, versions et aperçus"
                    ),
                    L(
                        "Web 不能安装；桌面端五个 tab 管理",
                        "Web 不能安裝；桌面端五個 tab 管理",
                        "Web cannot install; five desktop tabs manage MODs",
                        "Webは導入不可。デスクトップの5タブで管理",
                        "웹은 설치 불가, 데스크톱 다섯 탭에서 관리",
                        "Web : pas d'installation ; cinq onglets desktop"
                    ),
                    L(
                        "下载队列串行，完成 4 秒后消失",
                        "下載佇列串行，完成 4 秒後消失",
                        "Download queue is serial; done after 4 seconds",
                        "DLキューは直列、完了後4秒で消える",
                        "다운로드 큐는 직렬, 완료 후 4초 뒤 사라짐",
                        "File séquentielle ; disparaît après 4 s"
                    ),
                    L(
                        "导入默认禁用；管理页 + 启动器两步启用",
                        "匯入預設停用；管理頁 + 啟動器兩步啟用",
                        "Imports start disabled; enable in management + launcher",
                        "取り込みは無効。管理ページ＋ランチャーで有効化",
                        "가져오기는 비활성, 관리 페이지 + 런처에서 활성화",
                        "Import désactivé ; activation gestion + lanceur"
                    ),
                ],
                route: "/mods",
                routeLabel: L("打开 MOD 商店", "開啟 MOD 商店", "Open MOD store", "MODストアを開く", "MOD 상점 열기", "Ouvrir la boutique"),
                hint: L(
                    "发布需登录；原创或转载记得写来源",
                    "發佈需登入；原創或轉載記得寫來源",
                    "Publishing needs login; mark original or add a source",
                    "公開にはログイン。オリジナル／転載と出典を明記",
                    "게시하려면 로그인, 창작/재게시와 출처를 표시하세요",
                    "Publier exige une connexion ; original ou source à indiquer"
                ),
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "现在，去商店挑一个 MOD。",
                        "現在，去商店挑一個 MOD。",
                        "Now go pick a MOD from the store.",
                        "さあ、ストアでMODを選びましょう。",
                        "이제 상점에서 MOD를 골라 보세요.",
                        "Choisissez maintenant un MOD dans la boutique."
                    ),
                },
            ],
        },
    ],
}
