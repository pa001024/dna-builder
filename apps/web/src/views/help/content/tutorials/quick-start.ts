import { L, type Tutorial } from "../types"

export const quickStartTutorial: Tutorial = {
    id: "quick-start",
    number: "01",
    category: "start",
    title: L("快速开始", "快速開始", "Quick Start", "クイックスタート", "빠른 시작", "Démarrage rapide"),
    subtitle: L(
        "先过三道闸，再认路",
        "先過三道閘，再認路",
        "Clear three gates, then learn the map",
        "3つのゲートを通ってから道順を覚える",
        "세 관문을 지나고 길을 익히기",
        "Trois étapes, puis le plan"
    ),
    summary: L(
        "冷启动的三道闸：应用更新、数据包、版本日志；认清首页、侧边栏与 More；数据包可换源与回滚，帮助中心不装包也能看。",
        "冷啟動的三道閘：應用程式更新、資料包、版本日誌；認清首頁、側邊欄與 More；資料包可換源與回滾，幫助中心不裝包也能看。",
        "The three startup gates: app update, data pack, changelog. Learn the home page, sidebar, and More. Packs can switch sources and roll back, and Help works without one.",
        "起動時の3つのゲート（アプリ更新・データパック・更新履歴）。ホーム、サイドバー、More の使い方。データパックはソース切替とロールバックができ、ヘルプはパックなしでも見られます。",
        "시작 시 세 관문(앱 업데이트, 데이터 팩, 변경 로그)을 익히고 홈, 사이드바, More를 파악합니다. 데이터 팩은 소스 전환과 롤백이 가능하며 도움말은 팩 없이도 열립니다.",
        "Les trois étapes du démarrage : mise à jour, pack de données, journal. Le home, la barre latérale et More. Changer de source et revenir en arrière ; l'aide fonctionne sans pack."
    ),
    icon: "ri:rocket-2-line",
    accent: "#4facfe",
    route: "/",
    routeLabel: L("回到首页", "回到首頁", "Open Home", "ホームを開く", "홈 열기", "Ouvrir l'accueil"),
    platforms: ["web"],
    scenes: [
        {
            id: "intro",
            chapter: L("开场", "開場", "Intro", "導入", "인트로", "Intro"),
            duration: 5,
            shot: {
                type: "title",
                variant: "intro",
                kicker: L(
                    "EP 01 · 开始使用",
                    "EP 01 · 開始使用",
                    "EP 01 · GETTING STARTED",
                    "EP 01 · はじめに",
                    "EP 01 · 시작하기",
                    "EP 01 · PREMIERS PAS"
                ),
                title: L("快速开始", "快速開始", "Quick Start", "クイックスタート", "빠른 시작", "Démarrage rapide"),
                subtitle: L(
                    "第一次打开，先过三道闸。",
                    "第一次開啟，先過三道閘。",
                    "On first launch, clear three gates.",
                    "初回起動では、まず3つのゲートを。",
                    "처음 열면 세 관문부터.",
                    "Au premier lancement, trois étapes."
                ),
                icon: "ri:rocket-2-line",
                index: "01",
            },
            captions: [
                {
                    at: 0.9,
                    text: L(
                        "第一次打开，先看系统把哪些东西准备好。",
                        "第一次開啟，先看系統把哪些東西準備好。",
                        "On first launch, watch what the app prepares before you start.",
                        "初回起動では、まず何が準備されるかを見てみましょう。",
                        "처음 열면 시스템이 무엇을 준비하는지 먼저 보세요.",
                        "Au premier lancement, regardez ce que l'app prépare."
                    ),
                },
            ],
        },
        {
            id: "first-run",
            chapter: L("首次启动", "首次啟動", "First launch", "初回起動", "첫 실행", "Premier lancement"),
            duration: 11,
            shot: {
                type: "steps",
                kicker: L("FIRST RUN", "FIRST RUN", "FIRST RUN", "FIRST RUN", "FIRST RUN", "PREMIER LANCEMENT"),
                title: L(
                    "三道闸，按顺序来",
                    "三道閘，按順序來",
                    "Three gates, in order",
                    "3つのゲートを順番に",
                    "세 관문을 순서대로",
                    "Trois étapes, dans l'ordre"
                ),
                steps: [
                    {
                        icon: "ri:download-2-line",
                        title: L("应用更新", "應用程式更新", "App update", "アプリ更新", "앱 업데이트", "Mise à jour de l'app"),
                        desc: L(
                            "桌面端发现新版本时先更新；网页端会跳过。",
                            "桌面端發現新版本時先更新；網頁端會跳過。",
                            "On desktop, update first when a new version appears; the web skips this.",
                            "デスクトップでは新バージョンがあれば先に更新。Web では省略されます。",
                            "데스크톱은 새 버전이 있으면 먼저 업데이트하고, 웹은 건너뜁니다.",
                            "Sur desktop, mettez à jour d'abord ; le web saute cette étape."
                        ),
                    },
                    {
                        icon: "ri:database-2-line",
                        title: L(
                            "安装数据包",
                            "安裝資料包",
                            "Install the data pack",
                            "データパックを入れる",
                            "데이터 팩 설치",
                            "Installer le pack"
                        ),
                        desc: L(
                            "未安装会提示安装；它决定游戏数据的显示。",
                            "未安裝會提示安裝；它決定遊戲資料的顯示。",
                            "If missing, you are prompted to install; it controls game data display.",
                            "未導入なら案内が出ます。ゲームデータの表示を決めるものです。",
                            "없으면 설치 안내가 뜹니다. 게임 데이터 표시를 결정합니다.",
                            "S'il manque, une invite s'affiche ; il détermine l'affichage des données."
                        ),
                    },
                    {
                        icon: "ri:file-list-line",
                        title: L("版本日志", "版本日誌", "Changelog", "更新履歴", "변경 로그", "Journal des versions"),
                        desc: L(
                            "欢迎页列出新版本内容，点“了解了”关闭。",
                            "歡迎頁列出新版本內容，點「了解了」關閉。",
                            "The welcome page lists what's new; dismiss it with “Got it”.",
                            "ウェルカム画面に新着内容。最後に「了解」で閉じます。",
                            "환영 페이지에 새 내용이 나오며 “확인”으로 닫습니다.",
                            "La page d'accueil liste les nouveautés ; fermez avec « Compris »."
                        ),
                    },
                ],
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "冷启动按顺序走三道闸：应用更新、数据包、版本日志。",
                        "冷啟動按順序走三道閘：應用程式更新、資料包、版本日誌。",
                        "Startup runs three gates in order: app update, data pack, changelog.",
                        "起動時はアプリ更新、データパック、更新履歴の順です。",
                        "시작 시 앱 업데이트, 데이터 팩, 변경 로그 순서로 진행됩니다.",
                        "Au démarrage : mise à jour, pack de données, journal."
                    ),
                },
                {
                    at: 5.6,
                    text: L(
                        "网页端没有应用更新，直接从数据包开始。",
                        "網頁端沒有應用程式更新，直接從資料包開始。",
                        "The web has no app update; it starts with the data pack.",
                        "Web ではアプリ更新がなく、データパックから始まります。",
                        "웹에는 앱 업데이트가 없어 데이터 팩부터 시작합니다.",
                        "Le web n'a pas de mise à jour d'app ; il commence par le pack."
                    ),
                },
            ],
            note: L(
                "桌面端会检查应用更新",
                "桌面端會檢查應用程式更新",
                "App update is desktop-only",
                "アプリ更新はデスクトップのみ",
                "앱 업데이트는 데스크톱 전용",
                "Mise à jour sur desktop uniquement"
            ),
        },
        {
            id: "pack-install",
            chapter: L("数据包", "資料包", "Data pack", "データパック", "데이터 팩", "Pack de données"),
            duration: 10,
            shot: {
                type: "launcher",
                mode: "pack",
                title: L(
                    "安装数据包",
                    "安裝資料包",
                    "Install the data pack",
                    "データパックを入れる",
                    "데이터 팩 설치",
                    "Installer le pack"
                ),
                subtitle: L(
                    "数据包和安装包是分开的",
                    "資料包和安裝包是分開的",
                    "The pack is separate from the installer",
                    "データパックとインストーラーは別物",
                    "데이터 팩과 설치 패키지는 별개",
                    "Le pack est distinct de l'installateur"
                ),
                versions: [
                    { label: L("当前版本", "目前版本", "Current", "現在", "현재 버전", "Version actuelle"), value: "—" },
                    { label: L("最新版本", "最新版本", "Latest", "最新", "최신 버전", "Dernière version"), value: "v2.3.1", active: true },
                ],
                progress: {
                    label: L(
                        "正在下载数据包，请稍候…",
                        "正在下載資料包，請稍候…",
                        "Downloading the data pack…",
                        "データパックをダウンロード中…",
                        "데이터 팩 다운로드 중…",
                        "Téléchargement du pack…"
                    ),
                    value: 72,
                },
                status: L(
                    "数据包可更新",
                    "資料包可更新",
                    "Pack update available",
                    "データパック更新あり",
                    "데이터 팩 업데이트 가능",
                    "Mise à jour disponible"
                ),
                actions: [
                    L("下载 v2.3.1", "下載 v2.3.1", "Download v2.3.1", "v2.3.1 をダウンロード", "v2.3.1 다운로드", "Télécharger v2.3.1"),
                    L("打开设置", "開啟設定", "Open Settings", "設定を開く", "설정 열기", "Ouvrir les réglages"),
                    L("忽略", "忽略", "Skip", "後で", "무시", "Ignorer"),
                ],
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "没装数据包会提示安装；它决定游戏数据的显示。",
                        "沒裝資料包會提示安裝；它決定遊戲資料的顯示。",
                        "If no pack is installed, you are prompted; it controls game data display.",
                        "未導入ならインストール案内が出ます。ゲームデータの表示を決めます。",
                        "팩이 없으면 설치 안내가 뜹니다. 게임 데이터 표시를 결정합니다.",
                        "Sans pack, une invite s'affiche ; il détermine l'affichage des données."
                    ),
                },
                {
                    at: 5.6,
                    text: L(
                        "按钮有下载、打开设置、忽略；忽略只跳过这一版。",
                        "按鈕有下載、開啟設定、忽略；忽略只跳過這一版。",
                        "Buttons offer download, settings, and skip; skip only passes this version.",
                        "ダウンロード・設定・後で。後ではこの版だけ飛ばします。",
                        "다운로드, 설정 열기, 무시가 있습니다. 무시는 이번 버전만 건너뜁니다.",
                        "Télécharger, réglages ou ignorer ; ignorer ne saute que cette version."
                    ),
                },
            ],
            note: L(
                "数据包与安装包分离",
                "資料包與安裝包分離",
                "Pack ≠ installer",
                "パックとインストーラーは別",
                "팩과 설치 패키지 분리",
                "Pack ≠ installateur"
            ),
        },
        {
            id: "home",
            chapter: L("首页", "首頁", "Home", "ホーム", "홈", "Accueil"),
            duration: 10,
            shot: {
                type: "cards",
                kicker: "HOME",
                title: L(
                    "首页就是控制台",
                    "首頁就是控制台",
                    "Home is your console",
                    "ホームはコンソール",
                    "홈이 곧 콘솔",
                    "Le home est votre console"
                ),
                variant: "tiles",
                toolbar: {
                    tabs: [
                        L("快捷导航", "快捷導覽", "Quick nav", "クイックナビ", "빠른 내비", "Nav rapide"),
                        L("待办", "待辦", "To-do", "やること", "할 일", "À faire"),
                        L("最近构筑", "最近構築", "Recent builds", "最近の構築", "최근 빌드", "Builds récents"),
                        L("活动日历", "活動日曆", "Event calendar", "イベント暦", "이벤트 달력", "Calendrier"),
                    ],
                    activeTab: 0,
                    actions: [
                        L("板块设置", "版面設定", "Section settings", "セクション設定", "섹션 설정", "Réglages des sections"),
                        L(
                            "自定义快捷导航",
                            "自訂快捷導覽",
                            "Customize quick nav",
                            "クイックナビ編集",
                            "빠른 내비 편집",
                            "Personnaliser la nav"
                        ),
                    ],
                },
                items: [
                    {
                        title: L("构筑", "構築", "Character build", "キャラ構築", "캐릭터 빌드", "Construction"),
                        subtitle: L(
                            "角色伤害计算",
                            "角色傷害計算",
                            "Character damage",
                            "キャラのダメージ計算",
                            "캐릭터 피해 계산",
                            "Dégâts des personnages"
                        ),
                        icon: "ri:hammer-line",
                        tag: L("默认", "預設", "Default", "既定", "기본", "Par défaut"),
                        meta: "/char",
                    },
                    {
                        title: L("资料库", "資料庫", "Database", "データベース", "데이터베이스", "Base de données"),
                        subtitle: L(
                            "角色 · 武器 · 魔之楔",
                            "角色 · 武器 · 魔之楔",
                            "Characters, weapons, mods",
                            "キャラ・武器・魔之楔",
                            "캐릭터·무기·모드",
                            "Personnages, armes, mods"
                        ),
                        icon: "ri:book-line",
                        tag: L("默认", "預設", "Default", "既定", "기본", "Par défaut"),
                        meta: "/db",
                    },
                    {
                        title: L("资源", "資源", "Resources", "資源", "자원", "Ressources"),
                        subtitle: L(
                            "物品与材料",
                            "物品與材料",
                            "Items and materials",
                            "アイテムと素材",
                            "아이템과 재료",
                            "Objets et matériaux"
                        ),
                        icon: "ri:box-1-line",
                        tag: L("默认", "預設", "Default", "既定", "기본", "Par défaut"),
                        meta: "/db/resource",
                    },
                    {
                        title: L("养成计算", "養成計算", "Level-up calculator", "育成計算", "육성 계산", "Calcul de progression"),
                        subtitle: L(
                            "从当前到目标",
                            "從目前到目標",
                            "From current to target",
                            "現状から目標へ",
                            "현재에서 목표까지",
                            "Du actuel à la cible"
                        ),
                        icon: "ri:calculator-line",
                        tag: L("默认", "預設", "Default", "既定", "기본", "Par défaut"),
                        meta: "/levelup",
                    },
                    {
                        title: L("榜单", "榜單", "Ranking", "ランキング", "순위", "Classement"),
                        subtitle: L(
                            "社区高分构筑",
                            "社群高分構築",
                            "Top community builds",
                            "コミュニティ高スコア",
                            "커뮤니티 상위 빌드",
                            "Meilleurs builds"
                        ),
                        icon: "ri:sort-number-asc",
                        tag: L("默认", "預設", "Default", "既定", "기본", "Par défaut"),
                        meta: "/ranking",
                    },
                    {
                        title: L("深渊使用率", "深淵使用率", "Abyss usage", "深淵使用率", "심연 사용률", "Usage des abysses"),
                        subtitle: L(
                            "赛季阵容统计",
                            "賽季陣容統計",
                            "Season lineup stats",
                            "シーズン編成統計",
                            "시즌 편성 통계",
                            "Stats de saison"
                        ),
                        icon: "ri:bar-chart-line",
                        tag: L("默认", "預設", "Default", "既定", "기본", "Par défaut"),
                        meta: "/abyss-usage",
                    },
                    {
                        title: L("成就", "成就", "Achievements", "実績", "업적", "Succès"),
                        subtitle: L("收集进度", "收集進度", "Collection progress", "収集進捗", "수집 진행", "Collection"),
                        icon: "ri:trophy-line",
                        tag: L("默认", "預設", "Default", "既定", "기본", "Par défaut"),
                        meta: "/achievement",
                    },
                    {
                        title: L("More", "More", "More", "More", "More", "More"),
                        subtitle: L("全部功能", "全部功能", "All features", "すべての機能", "모든 기능", "Toutes les fonctions"),
                        icon: "ri:more-line",
                        tag: L("默认", "預設", "Default", "既定", "기본", "Par défaut"),
                        meta: "/more",
                    },
                ],
                columns: 4,
                highlight: 0,
                highlightAt: 2.1,
                highlightLabel: L("点击进入", "點擊進入", "Open", "開く", "열기", "Ouvrir"),
                footnote: L(
                    "Hero 显示开服第 N 天与当前版本",
                    "Hero 顯示開服第 N 天與目前版本",
                    "The hero shows launch day and current version",
                    "Hero にはサービス開始からの日数と現在のバージョン",
                    "Hero에 오픈 일수와 현재 버전 표시",
                    "Le hero affiche le jour de lancement et la version"
                ),
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "首页顶部是 Hero：开服天数、当前版本和检查更新。",
                        "首頁頂部是 Hero：開服天數、目前版本和檢查更新。",
                        "The hero shows launch days, current version, and update check.",
                        "Hero には開服日数、現在バージョン、更新確認があります。",
                        "홈 상단 Hero에는 오픈 일수, 현재 버전, 업데이트 확인이 있습니다.",
                        "Le hero affiche les jours, la version et la vérification des mises à jour."
                    ),
                },
                {
                    at: 5.4,
                    text: L(
                        "下方是快捷导航与七个板块；板块设置可排序、隐藏、恢复默认。",
                        "下方是快捷導覽與七個版面；版面設定可排序、隱藏、恢復預設。",
                        "Below are quick nav and seven sections; Section settings reorders, hides, or resets them.",
                        "下はクイックナビと7つのセクション。設定で並べ替え・非表示・初期化ができます。",
                        "아래는 빠른 내비와 7개 섹션입니다. 섹션 설정에서 정렬, 숨김, 초기화가 가능합니다.",
                        "En dessous : nav rapide et sept sections ; réglages pour réordonner, masquer ou réinitialiser."
                    ),
                },
            ],
        },
        {
            id: "navigation",
            chapter: L(
                "侧边栏与 More",
                "側邊欄與 More",
                "Sidebar & More",
                "サイドバーと More",
                "사이드바와 More",
                "Barre latérale et More"
            ),
            duration: 9,
            shot: {
                type: "cards",
                kicker: "NAVIGATION",
                title: L(
                    "侧边栏与 More",
                    "側邊欄與 More",
                    "Sidebar & More",
                    "サイドバーと More",
                    "사이드바와 More",
                    "Barre latérale et More"
                ),
                variant: "tiles",
                sidebar: {
                    items: [
                        { label: L("首页", "首頁", "Home", "ホーム", "홈", "Accueil"), icon: "ri:bookmark-line" },
                        { label: L("构筑", "構築", "Build", "構築", "빌드", "Construction"), icon: "ri:hammer-line" },
                        { label: L("地图工具", "地圖工具", "Map tool", "地図ツール", "지도 도구", "Carte"), icon: "ri:map-2-line" },
                        {
                            label: L("资料库", "資料庫", "Database", "データベース", "데이터베이스", "Base de données"),
                            icon: "ri:book-line",
                        },
                        { label: L("聊天", "聊天", "Chat", "チャット", "채팅", "Chat"), icon: "ri:chat-3-line" },
                        { label: L("More", "More", "More", "More", "More", "More"), icon: "ri:more-line" },
                        { label: L("设置", "設定", "Settings", "設定", "설정", "Réglages"), icon: "ri:settings-3-line" },
                    ],
                    active: 5,
                },
                toolbar: {
                    tabs: [
                        L("磁贴", "磁貼", "Tiles", "タイル", "타일", "Tuiles"),
                        L("Home 快捷", "Home 快捷", "Home entries", "Home ショートカット", "Home 바로가기", "Entrées Home"),
                    ],
                    activeTab: 0,
                    actions: [L("入口风格", "入口風格", "Entry style", "表示スタイル", "표시 스타일", "Style d'entrée")],
                },
                items: [
                    {
                        title: L("皎皎角", "皎皎角", "Jiaojiao", "皎皎角", "쟈오쟈오", "Jiaojiao"),
                        subtitle: L(
                            "签到 · 论坛 · 公告",
                            "簽到 · 論壇 · 公告",
                            "Check-in, forum, news",
                            "签到・フォーラム・お知らせ",
                            "출석·포럼·공지",
                            "Check-in, forum, annonces"
                        ),
                        icon: "ri:chat-thread-line",
                        tag: L("社区", "社群", "Community", "コミュニティ", "커뮤니티", "Communauté"),
                        meta: L(
                            "需皎皎角账号",
                            "需皎皎角帳號",
                            "Jiaojiao account",
                            "皎皎角アカウントが必要",
                            "쟈오쟈오 계정 필요",
                            "Compte Jiaojiao"
                        ),
                    },
                    {
                        title: L("攻略", "攻略", "Guides", "攻略", "공략", "Guides"),
                        subtitle: L(
                            "图文与一图流",
                            "圖文與一圖流",
                            "Text and one-image guides",
                            "記事と一図流",
                            "글과 한장 공략",
                            "Guides texte et image"
                        ),
                        icon: "ri:book-line",
                        tag: L("社区", "社群", "Community", "コミュニティ", "커뮤니티", "Communauté"),
                        meta: "/guides",
                    },
                    {
                        title: L("深渊使用率", "深淵使用率", "Abyss usage", "深淵使用率", "심연 사용률", "Usage des abysses"),
                        subtitle: L(
                            "赛季阵容统计",
                            "賽季陣容統計",
                            "Season lineup stats",
                            "シーズン編成統計",
                            "시즌 편성 통계",
                            "Stats de saison"
                        ),
                        icon: "ri:bar-chart-line",
                        tag: L("数据", "資料", "Data", "データ", "데이터", "Données"),
                        meta: "/abyss-usage",
                    },
                    {
                        title: L("榜单", "榜單", "Ranking", "ランキング", "순위", "Classement"),
                        subtitle: L(
                            "社区构筑排名",
                            "社群構築排名",
                            "Community build ranking",
                            "コミュニティ構築ランキング",
                            "커뮤니티 빌드 순위",
                            "Classement des builds"
                        ),
                        icon: "ri:sort-number-asc",
                        tag: L("社区", "社群", "Community", "コミュニティ", "커뮤니티", "Communauté"),
                        meta: "/ranking",
                    },
                    {
                        title: L("帮助中心", "幫助中心", "Help Center", "ヘルプセンター", "도움말 센터", "Centre d'aide"),
                        subtitle: L(
                            "视频化教程",
                            "影片化教學",
                            "Video tutorials",
                            "動画チュートリアル",
                            "영상 튜토리얼",
                            "Tutoriels vidéo"
                        ),
                        icon: "ri:question-line",
                        tag: L("免数据包", "免資料包", "No pack", "パック不要", "팩 불필요", "Sans pack"),
                        meta: "/help",
                    },
                    {
                        title: L("万华", "萬華", "Wanhua", "万華", "완화", "Wanhua"),
                        subtitle: L("抽卡模拟", "抽卡模擬", "Gacha simulator", "ガチャシミュ", "가챠 시뮬", "Simulateur de gacha"),
                        icon: "ri:sparkling-line",
                        tag: L("工具", "工具", "Tools", "ツール", "도구", "Outils"),
                        meta: "/skin-gacha",
                    },
                    {
                        title: L("魔灵竞速", "魔靈競速", "Spirit race", "魔霊レース", "마령 레이스", "Course des esprits"),
                        subtitle: L(
                            "竞速记录与模拟",
                            "競速記錄與模擬",
                            "Race records and sim",
                            "レース記録とシミュ",
                            "레이스 기록과 시뮬",
                            "Courses et simulation"
                        ),
                        icon: "ri:game-line",
                        tag: L("工具", "工具", "Tools", "ツール", "도구", "Outils"),
                        meta: "/race-lottery",
                    },
                    {
                        title: L("设置", "設定", "Settings", "設定", "설정", "Réglages"),
                        subtitle: L(
                            "外观与数据包",
                            "外觀與資料包",
                            "Appearance and packs",
                            "外観とデータパック",
                            "외형과 데이터 팩",
                            "Apparence et packs"
                        ),
                        icon: "ri:settings-3-line",
                        tag: L("系统", "系統", "System", "システム", "시스템", "Système"),
                        meta: "/setting",
                    },
                ],
                columns: 4,
                highlight: 4,
                highlightAt: 2.2,
                highlightLabel: L("无需数据包", "無需資料包", "No pack needed", "パック不要", "팩 불필요", "Sans pack"),
                footnote: L(
                    "长按 380ms 拖拽；右键改颜色和尺寸",
                    "長按 380ms 拖曳；右鍵改顏色和尺寸",
                    "Long-press 380ms to drag; right-click to recolor and resize",
                    "380ms 長押しでドラッグ、右クリックで色とサイズ",
                    "380ms 길게 눌러 드래그, 우클릭으로 색/크기",
                    "Appui long 380 ms pour glisser ; clic droit pour couleur et taille"
                ),
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "侧边栏放一级导航，底部常驻皎皎角账号与设置。",
                        "側邊欄放一級導覽，底部常駐皎皎角帳號與設定。",
                        "The sidebar holds top-level nav; Jiaojiao account and Settings stay at the bottom.",
                        "サイドバーは主要ナビ。下部に皎皎角アカウントと設定が固定されます。",
                        "사이드바는 최상위 내비게이션이며, 하단에 쟈오쟈오 계정과 설정이 고정됩니다.",
                        "La barre latérale porte la navigation ; compte Jiaojiao et réglages restent en bas."
                    ),
                },
                {
                    at: 5.0,
                    text: L(
                        "More 收纳全部功能，磁贴或 Home 快捷入口任切；长按拖拽、右键改色。",
                        "More 收納全部功能，磁貼或 Home 快捷入口任切；長按拖曳、右鍵改色。",
                        "More collects every feature, in tiles or Home-style entries; long-press to drag, right-click to recolor.",
                        "More は全機能の入口。タイル／Home ショートカットを切替、長押しドラッグ、右クリックで色変更。",
                        "More에는 모든 기능이 있습니다. 타일/Home 바로가기 전환, 길게 눌러 드래그, 우클릭 색 변경.",
                        "More regroupe tout, en tuiles ou entrées Home ; appui long pour glisser, clic droit pour la couleur."
                    ),
                },
            ],
        },
        {
            id: "pack-callout",
            chapter: L("数据包管理", "資料包管理", "Data pack management", "データパック管理", "데이터 팩 관리", "Gestion des packs"),
            duration: 9.5,
            shot: {
                type: "callout",
                kicker: "DATA PACK",
                icon: "ri:database-2-line",
                title: L(
                    "数据包可以换、可以回滚",
                    "資料包可以換、可以回滾",
                    "Packs can switch and roll back",
                    "データパックは交換もロールバックもできる",
                    "데이터 팩은 교체와 롤백이 가능합니다",
                    "Le pack se change et se restaure"
                ),
                points: [
                    {
                        icon: "ri:database-2-line",
                        text: L(
                            "安装包管程序，数据包管游戏数据；更新不必重装。",
                            "安裝包管程式，資料包管遊戲資料；更新不必重裝。",
                            "The installer carries the app; the pack carries game data. Updates need no reinstall.",
                            "インストーラーはアプリ、パックはゲームデータ。更新に再インストールは不要。",
                            "설치 패키지는 앱, 데이터 팩은 게임 데이터. 업데이트에 재설치가 필요 없습니다.",
                            "L'installateur porte l'app, le pack porte les données. Pas besoin de réinstaller."
                        ),
                    },
                    {
                        icon: "ri:server-line",
                        text: L(
                            "自动 / 官方源 / 镜像源 / 自定义源；优先差分下载。",
                            "自動 / 官方源 / 鏡像源 / 自訂源；優先差異下載。",
                            "Auto, official, mirror, or custom source; differential download first.",
                            "自動・公式・ミラー・カスタム。差分ダウンロードを優先。",
                            "자동/공식/미러/사용자 소스, 차분 다운로드 우선.",
                            "Auto, officiel, miroir ou personnalisé ; téléchargement différentiel d'abord."
                        ),
                    },
                    {
                        icon: "ri:history-line",
                        text: L(
                            "旧版本下载后点“使用”即可回滚。",
                            "舊版本下載後點「使用」即可回滾。",
                            "Download an old version and press “Use” to roll back.",
                            "旧版をダウンロードして「使用」で戻せます。",
                            "이전 버전을 받은 뒤 “사용”을 누르면 롤백됩니다.",
                            "Téléchargez une ancienne version puis « Utiliser »."
                        ),
                    },
                ],
                note: L(
                    "帮助中心 /help 不依赖数据包，装包前也能打开。",
                    "幫助中心 /help 不依賴資料包，裝包前也能開啟。",
                    "Help at /help needs no pack and opens before installation.",
                    "ヘルプ /help はパック不要で、導入前でも開けます。",
                    "도움말 /help는 팩 없이도 열 수 있습니다.",
                    "L'aide /help ne dépend d'aucun pack."
                ),
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "数据包与安装包分离：换源、差分更新，旧版本还能下回来。",
                        "資料包與安裝包分離：換源、差異更新，舊版本還能下回來。",
                        "Pack and installer are separate: switch sources, update by diff, and restore old versions.",
                        "パックとインストーラーは別。ソース切替、差分更新、旧版の復元が可能です。",
                        "팩과 설치 패키지는 별개입니다. 소스 전환, 차분 업데이트, 이전 버전 복원이 가능합니다.",
                        "Pack et installateur sont distincts : sources, mise à jour différentielle, retour arrière."
                    ),
                },
                {
                    at: 4.8,
                    text: L(
                        "帮助中心不依赖数据包，直接打开 /help 就能看。",
                        "幫助中心不依賴資料包，直接開啟 /help 就能看。",
                        "Help needs no data pack; just open /help.",
                        "ヘルプはパック不要。/help を直接開けます。",
                        "도움말은 데이터 팩이 필요 없습니다. /help를 바로 여세요.",
                        "L'aide ne dépend d'aucun pack : ouvrez /help."
                    ),
                },
            ],
        },
        {
            id: "recap",
            chapter: L("回顾", "回顧", "Recap", "まとめ", "정리", "Récapitulatif"),
            duration: 8.5,
            shot: {
                type: "recap",
                title: L(
                    "先过闸，再开始",
                    "先過閘，再開始",
                    "Clear the gates, then start",
                    "ゲートを通って始めよう",
                    "관문을 지나고 시작하기",
                    "Franchissez les étapes"
                ),
                checklist: [
                    L(
                        "冷启动：应用更新 → 数据包 → 版本日志",
                        "冷啟動：應用程式更新 → 資料包 → 版本日誌",
                        "Startup: app update → data pack → changelog",
                        "起動：アプリ更新 → データパック → 更新履歴",
                        "시작: 앱 업데이트 → 데이터 팩 → 변경 로그",
                        "Démarrage : app → pack → journal"
                    ),
                    L(
                        "首页板块与快捷导航都能自定义",
                        "首頁版面與快捷導覽都能自訂",
                        "Home sections and quick nav are customizable",
                        "ホームのセクションとクイックナビは編集可能",
                        "홈 섹션과 빠른 내비는 사용자 지정 가능",
                        "Sections et nav personnalisables"
                    ),
                    L(
                        "数据包可换源、可回滚；帮助中心免数据包",
                        "資料包可換源、可回滾；幫助中心免資料包",
                        "Packs switch sources and roll back; Help needs no pack",
                        "パックはソース切替とロールバック、ヘルプは不要",
                        "팩은 소스 전환/롤백, 도움말은 불필요",
                        "Pack : sources et retour ; aide sans pack"
                    ),
                ],
                route: "/",
                routeLabel: L("去首页", "去首頁", "Go to Home", "ホームへ", "홈으로", "Aller à l'accueil"),
                hint: L(
                    "帮助中心在 More 里，或直接打开 /help。",
                    "幫助中心在 More 裡，或直接開啟 /help。",
                    "Help lives in More, or open /help directly.",
                    "ヘルプは More にあります。直接 /help でも開けます。",
                    "도움말은 More에 있으며 /help로 바로 열 수 있습니다.",
                    "L'aide est dans More, ou ouvrez /help."
                ),
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "现在回到首页，先从快捷导航开始。",
                        "現在回到首頁，先從快捷導覽開始。",
                        "Head back home and start from the quick nav.",
                        "ホームに戻って、クイックナビから始めましょう。",
                        "홈으로 돌아가 빠른 내비부터 시작하세요.",
                        "Revenez au home et partez de la navigation rapide."
                    ),
                },
            ],
        },
    ],
}
