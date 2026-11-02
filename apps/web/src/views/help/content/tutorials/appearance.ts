import { L, type Tutorial } from "../types"

export const appearanceTutorial: Tutorial = {
    id: "appearance",
    number: "12",
    category: "community",
    title: L(
        "外观与数据包",
        "外觀與資料包",
        "Appearance & Data Packs",
        "外観とデータパック",
        "외형과 데이터 팩",
        "Apparence et packs de données"
    ),
    subtitle: L(
        "界面、版本、安全模式",
        "介面、版本、安全模式",
        "Interface, versions, safe mode",
        "見た目・バージョン・セーフモード",
        "화면, 버전, 안전 모드",
        "Interface, versions, mode sûr"
    ),
    summary: L(
        "外观设置、侧边栏布局、数据包管理与安全模式：把界面调成自己的，也把版本握在手里。",
        "外觀設定、側邊欄版面、資料包管理與安全模式：把介面調成自己的，也把版本握在手裡。",
        "Appearance, sidebar layout, data pack management, and safe mode: make the interface yours and keep versions under control.",
        "外観設定、サイドバー配置、データパック管理、セーフモード。見た目を自分好みにし、バージョンを管理します。",
        "외형 설정, 사이드바 배치, 데이터 팩 관리, 안전 모드. 화면을 내 스타일로 바꾸고 버전을 관리합니다.",
        "Apparence, barre latérale, gestion des packs et mode sûr : personnalisez l'interface et gardez la main sur les versions."
    ),
    icon: "ri:settings-3-line",
    accent: "#f7971e",
    route: "/setting",
    routeLabel: L("打开设置", "開啟設定", "Open Settings", "設定を開く", "설정 열기", "Ouvrir les réglages"),
    platforms: ["web", "app"],
    scenes: [
        {
            id: "intro",
            chapter: L("开场", "開場", "Intro", "導入", "인트로", "Intro"),
            duration: 5,
            shot: {
                type: "title",
                variant: "intro",
                kicker: L("EP 12 · 设置", "EP 12 · 設定", "EP 12 · SETTINGS", "EP 12 · 設定", "EP 12 · 설정", "EP 12 · RÉGLAGES"),
                title: L(
                    "外观与数据包",
                    "外觀與資料包",
                    "Appearance & Data Packs",
                    "外観とデータパック",
                    "외형과 데이터 팩",
                    "Apparence et packs de données"
                ),
                subtitle: L(
                    "界面与侧边栏、版本、安全模式，一次讲清。",
                    "介面與側邊欄、版本、安全模式，一次講清。",
                    "Interface and sidebar, versions, and safe mode, explained.",
                    "見た目とサイドバー、バージョン、セーフモードを一度に。",
                    "화면과 사이드바, 버전, 안전 모드를 한 번에.",
                    "Interface et barre latérale, versions et mode sûr, en une fois."
                ),
                icon: "ri:settings-3-line",
                index: "12",
            },
            captions: [
                {
                    at: 0.9,
                    text: L(
                        "设置页很长，这集只看外观与侧边栏、数据包、安全模式。",
                        "設定頁很長，這集只看外觀與側邊欄、資料包、安全模式。",
                        "Settings is long; this episode covers appearance and sidebar, data packs, and safe mode.",
                        "設定は長いので、外観とサイドバー、データパック、セーフモードに絞ります。",
                        "설정은 길어서 이번에는 외형과 사이드바, 데이터 팩, 안전 모드만 봅니다.",
                        "Les réglages sont longs : apparence et barre latérale, packs et mode sûr."
                    ),
                },
            ],
        },
        {
            id: "appearance",
            chapter: L("外观设置", "外觀設定", "Appearance", "外観設定", "외형 설정", "Apparence"),
            duration: 10,
            shot: {
                type: "settings",
                title: L("外观设置", "外觀設定", "Appearance", "外観設定", "외형 설정", "Apparence"),
                nav: [
                    { label: L("外观设置", "外觀設定", "Appearance", "外観設定", "외형 설정", "Apparence"), icon: "ri:palette-line" },
                    { label: L("侧边栏", "側邊欄", "Sidebar", "サイドバー", "사이드바", "Barre latérale"), icon: "ri:menu-line" },
                    {
                        label: L("数据包管理", "資料包管理", "Data packs", "データパック管理", "데이터 팩 관리", "Packs de données"),
                        icon: "ri:database-2-line",
                    },
                    { label: L("账号", "帳號", "Account", "アカウント", "계정", "Compte"), icon: "ri:user-line" },
                    {
                        label: L("剧情文本", "劇情文字", "Story text", "ストーリーテキスト", "스토리 텍스트", "Texte d'histoire"),
                        icon: "ri:book-open-line",
                    },
                    { label: L("生成式AI", "生成式AI", "Generative AI", "生成AI", "생성형 AI", "IA générative"), icon: "ri:robot-2-line" },
                    { label: L("其他设置", "其他設定", "Other", "その他", "기타 설정", "Autres"), icon: "ri:settings-4-line" },
                ],
                activeNav: 0,
                sections: [
                    {
                        title: L("外观设置", "外觀設定", "Appearance", "外観設定", "외형 설정", "Apparence"),
                        rows: [
                            {
                                label: L("主题", "主題", "Theme", "テーマ", "테마", "Thème"),
                                control: "select",
                                value: L("深色主题", "深色主題", "Dark", "ダーク", "다크", "Sombre"),
                            },
                            {
                                label: L("自定义底图", "自訂底圖", "Custom wallpaper", "カスタム壁紙", "사용자 배경", "Fond personnalisé"),
                                control: "select",
                                value: L("已上传", "已上傳", "Uploaded", "アップロード済み", "업로드됨", "Importé"),
                            },
                            {
                                label: L(
                                    "底图透明度",
                                    "底圖透明度",
                                    "Wallpaper opacity",
                                    "壁紙の不透明度",
                                    "배경 불투명도",
                                    "Opacité du fond"
                                ),
                                control: "slider",
                                level: 72,
                            },
                            {
                                label: L("底图模糊度", "底圖模糊度", "Wallpaper blur", "壁紙のぼかし", "배경 흐림", "Flou du fond"),
                                control: "select",
                                value: L("12px", "12px", "12px", "12px", "12px", "12px"),
                            },
                            {
                                label: L(
                                    "自定义字体",
                                    "自訂字型",
                                    "Custom font",
                                    "カスタムフォント",
                                    "사용자 글꼴",
                                    "Police personnalisée"
                                ),
                                control: "select",
                                value: L("默认字体", "預設字型", "Default font", "既定フォント", "기본 글꼴", "Police par défaut"),
                            },
                            {
                                label: L("UI 缩放", "UI 縮放", "UI scale", "UI 拡大率", "UI 배율", "Échelle UI"),
                                control: "slider",
                                level: 100,
                            },
                            {
                                label: L("语言", "語言", "Language", "言語", "언어", "Langue"),
                                control: "select",
                                value: L("简体中文", "簡體中文", "English", "日本語", "한국어", "Français"),
                            },
                        ],
                    },
                ],
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "主题分浅色、深色与自定义；浅色列表里就有 ez。",
                        "主題分淺色、深色與自訂；淺色列表裡就有 ez。",
                        "Themes split into light, dark, and custom; ez is in the light list.",
                        "テーマはライト・ダーク・カスタム。ライト一覧に ez があります。",
                        "테마는 라이트, 다크, 사용자 지정이며 라이트 목록에 ez가 있습니다.",
                        "Thèmes clairs, sombres ou personnalisés ; ez figure dans les clairs."
                    ),
                },
                {
                    at: 5.4,
                    text: L(
                        "底图、字体、UI 缩放和语言同页，改完立即生效。",
                        "底圖、字型、UI 縮放和語言同頁，改完立即生效。",
                        "Wallpaper, font, UI scale, and language share one page; changes apply instantly.",
                        "壁紙・フォント・UI 拡大率・言語が同じページ。変更はすぐ反映されます。",
                        "배경, 글꼴, UI 배율, 언어가 한 페이지에 있으며 즉시 적용됩니다.",
                        "Fond, police, échelle et langue sur une page ; application immédiate."
                    ),
                },
            ],
            callouts: [
                {
                    at: 3.2,
                    text: L(
                        "透明度 / 模糊度",
                        "透明度 / 模糊度",
                        "Opacity / blur",
                        "不透明度 / ぼかし",
                        "불투명도 / 흐림",
                        "Opacité / flou"
                    ),
                    x: 58,
                    y: 36,
                },
                {
                    at: 6.8,
                    text: L(
                        "语言即时生效",
                        "語言即時生效",
                        "Language applies instantly",
                        "言語は即時反映",
                        "언어 즉시 적용",
                        "Langue immédiate"
                    ),
                    x: 52,
                    y: 82,
                },
            ],
            note: L(
                "桌面端主题下拉；网页端用标题栏",
                "桌面端主題下拉；網頁端用標題列",
                "Theme dropdown on desktop; title bar on web",
                "テーマ選択はデスクトップ、Web はタイトルバー",
                "데스크톱은 테마 선택, 웹은 제목 표시줄",
                "Thème sur desktop ; barre de titre sur le web"
            ),
        },
        {
            id: "custom-theme",
            chapter: L("自定义主题", "自訂主題", "Custom theme", "カスタムテーマ", "사용자 테마", "Thème personnalisé"),
            duration: 8,
            shot: {
                type: "callout",
                kicker: "CUSTOM THEME",
                icon: "ri:palette-line",
                title: L(
                    "自定义主题是一套设计令牌",
                    "自訂主題是一套設計權杖",
                    "A custom theme is a set of design tokens",
                    "カスタムテーマはデザイントークン一式",
                    "사용자 테마는 디자인 토큰 세트",
                    "Un thème, un jeu de jetons"
                ),
                points: [
                    {
                        icon: "ri:palette-line",
                        text: L(
                            "20 个语义色：primary、secondary、accent 等。",
                            "20 個語意色：primary、secondary、accent 等。",
                            "20 semantic colors: primary, secondary, accent, and more.",
                            "20 個のセマンティックカラー：primary、secondary、accent など。",
                            "20개 시맨틱 색상: primary, secondary, accent 등.",
                            "20 couleurs sémantiques : primary, secondary, accent…"
                        ),
                    },
                    {
                        icon: "ri:settings-3-line",
                        text: L(
                            "圆角、边框、深度、噪点四个维度。",
                            "圓角、邊框、深度、噪點四個維度。",
                            "Radius, border, depth, and noise.",
                            "角丸・枠線・深さ・ノイズの4軸。",
                            "라운드, 테두리, 깊이, 노이즈.",
                            "Rayons, bordures, profondeur, bruit."
                        ),
                    },
                    {
                        icon: "ri:refresh-line",
                        text: L(
                            "实时预览，改动写入本地设置。",
                            "即時預覽，改動寫入本機設定。",
                            "Preview live; changes save locally.",
                            "リアルタイムプレビューでローカル保存。",
                            "실시간 미리보기, 로컬 저장.",
                            "Aperçu en direct, sauvegarde locale."
                        ),
                    },
                ],
                note: L("仅桌面端", "僅桌面端", "Desktop only", "デスクトップのみ", "데스크톱 전용", "Desktop uniquement"),
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "自定义主题不止换色：20 个语义色逐个可调。",
                        "自訂主題不只換色：20 個語意色逐個可調。",
                        "A custom theme is more than color: 20 semantic colors, each adjustable.",
                        "カスタムテーマは色だけではありません。20 のセマンティックカラーを個別調整。",
                        "사용자 테마는 색만이 아닙니다. 20개 시맨틱 색상을 각각 조정합니다.",
                        "Un thème ne se limite pas aux couleurs : 20 jetons réglables."
                    ),
                },
                {
                    at: 4.6,
                    text: L(
                        "圆角、边框、深度、噪点也能改，实时预览。",
                        "圓角、邊框、深度、噪點也能改，即時預覽。",
                        "Radius, border, depth, and noise are editable with live preview.",
                        "角丸・枠線・深さ・ノイズも編集でき、即時プレビュー。",
                        "라운드, 테두리, 깊이, 노이즈도 수정하며 실시간 미리 봅니다.",
                        "Rayons, bordures, profondeur et bruit modifiables en direct."
                    ),
                },
            ],
        },
        {
            id: "sidebar-layout",
            chapter: L("侧边栏", "側邊欄", "Sidebar", "サイドバー", "사이드바", "Barre latérale"),
            duration: 9,
            shot: {
                type: "cards",
                kicker: "SIDEBAR",
                title: L("侧边栏布局", "側邊欄版面", "Sidebar layout", "サイドバー配置", "사이드바 배치", "Disposition de la barre"),
                items: [
                    {
                        title: L("首页", "首頁", "Home", "ホーム", "홈", "Accueil"),
                        icon: "ri:bookmark-line",
                        tag: L("始终保留", "始終保留", "Always kept", "常に表示", "항상 유지", "Toujours affiché"),
                    },
                    {
                        title: L("构筑", "構築", "Build", "構築", "빌드", "Construction"),
                        icon: "ri:hammer-line",
                        tag: L("可移除", "可移除", "Removable", "削除可", "제거 가능", "Retirable"),
                    },
                    {
                        title: L("地图工具", "地圖工具", "Map tool", "地図ツール", "지도 도구", "Carte"),
                        icon: "ri:map-2-line",
                        tag: L("可移除", "可移除", "Removable", "削除可", "제거 가능", "Retirable"),
                    },
                    {
                        title: L("资料库", "資料庫", "Database", "データベース", "데이터베이스", "Base de données"),
                        icon: "ri:book-line",
                        tag: L("可移除", "可移除", "Removable", "削除可", "제거 가능", "Retirable"),
                    },
                    {
                        title: L("聊天", "聊天", "Chat", "チャット", "채팅", "Chat"),
                        icon: "ri:chat-3-line",
                        tag: L("可移除", "可移除", "Removable", "削除可", "제거 가능", "Retirable"),
                    },
                    {
                        title: L("More", "More", "More", "More", "More", "More"),
                        icon: "ri:more-line",
                        tag: L("始终保留", "始終保留", "Always kept", "常に表示", "항상 유지", "Toujours affiché"),
                    },
                    {
                        title: L("攻略", "攻略", "Guides", "攻略", "공략", "Guides"),
                        icon: "ri:book-line",
                        tag: L("可选功能", "可選功能", "Optional", "追加可能", "선택 가능", "Optionnel"),
                    },
                    {
                        title: L("时间线", "時間軸", "Timeline", "タイムライン", "타임라인", "Chronologie"),
                        icon: "ri:time-line",
                        tag: L("可选功能", "可選功能", "Optional", "追加可能", "선택 가능", "Optionnel"),
                    },
                ],
                columns: 4,
                toolbar: { actions: [L("恢复默认", "恢復預設", "Reset", "初期化", "기본값", "Réinitialiser")] },
                footnote: L(
                    "上移 / 下移 / 删除；改动后可恢复默认",
                    "上移 / 下移 / 刪除；改動後可恢復預設",
                    "Move up, down, or remove; reset anytime",
                    "上へ・下へ・削除、後から初期化可",
                    "위/아래/삭제, 언제든 초기화",
                    "Monter, descendre, retirer ; réinitialisable"
                ),
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "侧边栏每项都能上移、下移、删除；首页与 More 始终保留。",
                        "側邊欄每項都能上移、下移、刪除；首頁與 More 始終保留。",
                        "Every sidebar item can move up, down, or be removed; Home and More stay.",
                        "サイドバーの各項目は上へ・下へ・削除が可能。ホームと More は固定。",
                        "사이드바 항목은 위/아래 이동, 삭제가 가능하며 홈과 More는 고정입니다.",
                        "Chaque entrée se déplace ou se retire ; Home et More restent."
                    ),
                },
                {
                    at: 5.0,
                    text: L(
                        "未加入的入口在“可选功能”里，点加号就能放回来。",
                        "未加入的入口在「可選功能」裡，點加號就能放回來。",
                        "Entries not in the bar sit under Optional; press plus to add them back.",
                        "未追加の入口は「追加可能」にあり、＋で戻せます。",
                        "추가되지 않은 항목은 “선택 가능”에 있으며 +로 다시 넣을 수 있습니다.",
                        "Les entrées absentes sont dans « Optionnel » ; le + les remet."
                    ),
                },
            ],
        },
        {
            id: "pack-manager",
            chapter: L("数据包管理", "資料包管理", "Data pack management", "データパック管理", "데이터 팩 관리", "Gestion des packs"),
            duration: 10,
            shot: {
                type: "launcher",
                mode: "pack",
                title: L("数据包管理", "資料包管理", "Data pack management", "データパック管理", "데이터 팩 관리", "Gestion des packs"),
                subtitle: L(
                    "换源、下载、回滚",
                    "換源、下載、回滾",
                    "Sources, downloads, rollback",
                    "ソース・DL・ロールバック",
                    "소스, 다운로드, 롤백",
                    "Sources, téléchargements, retour"
                ),
                versions: [
                    {
                        label: L("当前使用", "目前使用", "In use", "使用中", "현재 사용", "Version actuelle"),
                        value: "v2.3.1",
                        active: true,
                    },
                    { label: L("已下载", "已下載", "Downloaded", "ダウンロード済み", "다운로드됨", "Téléchargé"), value: "v2.2.0" },
                    { label: L("可下载", "可下載", "Available", "ダウンロード可能", "다운로드 가능", "Disponible"), value: "v2.1.0" },
                ],
                progress: {
                    label: L(
                        "正在下载 v2.1.0…",
                        "正在下載 v2.1.0…",
                        "Downloading v2.1.0…",
                        "v2.1.0 をダウンロード中…",
                        "v2.1.0 다운로드 중…",
                        "Téléchargement de v2.1.0…"
                    ),
                    value: 64,
                },
                status: L("版本列表", "版本列表", "Version list", "バージョン一覧", "버전 목록", "Liste des versions"),
                actions: [
                    L("下载", "下載", "Download", "ダウンロード", "다운로드", "Télécharger"),
                    L("使用", "使用", "Use", "使用", "사용", "Utiliser"),
                    L("导入", "匯入", "Import", "インポート", "가져오기", "Importer"),
                    L("清空", "清空", "Clear", "消去", "비우기", "Vider"),
                ],
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "来源可选自动、官方源、镜像源或自定义，版本号倒序排列。",
                        "來源可選自動、官方源、鏡像源或自訂，版本號倒序排列。",
                        "Sources: auto, official, mirror, or custom; versions sort newest first.",
                        "ソースは自動・公式・ミラー・カスタム。バージョンは新しい順です。",
                        "소스는 자동, 공식, 미러, 사용자 지정이며 버전은 최신순입니다.",
                        "Sources : auto, officiel, miroir ou personnalisé ; versions récentes d'abord."
                    ),
                },
                {
                    at: 5.4,
                    text: L(
                        "旧版本点“使用”即可回滚；还能导入 ZIP 或清空缓存。",
                        "舊版本點「使用」即可回滾；還能匯入 ZIP 或清空快取。",
                        "Press “Use” on an old version to roll back; import ZIPs or clear caches too.",
                        "旧版は「使用」でロールバック。ZIP のインポートやキャッシュ消去も可能です。",
                        "이전 버전에서 “사용”을 누르면 롤백됩니다. ZIP 가져오기나 캐시 비우기도 가능합니다.",
                        "« Utiliser » sur une ancienne version ; import ZIP ou vidage du cache."
                    ),
                },
            ],
            note: L(
                "桌面端可拖拽导出 ZIP",
                "桌面端可拖曳匯出 ZIP",
                "Drag out to export ZIP on desktop",
                "デスクトップではドラッグで ZIP 書き出し",
                "데스크톱은 드래그로 ZIP 내보내기",
                "Glisser pour exporter en ZIP sur desktop"
            ),
        },
        {
            id: "packs-safety",
            chapter: L("数据包与安全", "資料包與安全", "Packs & safety", "データパックと安全", "데이터 팩과 안전", "Packs et sécurité"),
            duration: 9,
            shot: {
                type: "settings",
                title: L(
                    "数据包与安全",
                    "資料包與安全",
                    "Data packs & safety",
                    "データパックと安全",
                    "데이터 팩과 안전",
                    "Packs et sécurité"
                ),
                nav: [
                    { label: L("外观设置", "外觀設定", "Appearance", "外観設定", "외형 설정", "Apparence"), icon: "ri:palette-line" },
                    { label: L("侧边栏", "側邊欄", "Sidebar", "サイドバー", "사이드바", "Barre latérale"), icon: "ri:menu-line" },
                    {
                        label: L("数据包管理", "資料包管理", "Data packs", "データパック管理", "데이터 팩 관리", "Packs de données"),
                        icon: "ri:database-2-line",
                    },
                    { label: L("账号", "帳號", "Account", "アカウント", "계정", "Compte"), icon: "ri:user-line" },
                    {
                        label: L("剧情文本", "劇情文字", "Story text", "ストーリーテキスト", "스토리 텍스트", "Texte d'histoire"),
                        icon: "ri:book-open-line",
                    },
                    { label: L("生成式AI", "生成式AI", "Generative AI", "生成AI", "생성형 AI", "IA générative"), icon: "ri:robot-2-line" },
                    { label: L("其他设置", "其他設定", "Other", "その他", "기타 설정", "Autres"), icon: "ri:settings-4-line" },
                ],
                activeNav: 2,
                sections: [
                    {
                        title: L("数据包管理", "資料包管理", "Data packs", "データパック管理", "데이터 팩 관리", "Packs de données"),
                        rows: [
                            {
                                label: L("来源", "來源", "Source", "ソース", "소스", "Source"),
                                control: "select",
                                value: L("自动", "自動", "Auto", "自動", "자동", "Auto"),
                            },
                            {
                                label: L("当前版本", "目前版本", "Current version", "現在のバージョン", "현재 버전", "Version actuelle"),
                                control: "select",
                                value: L("v2.3.1", "v2.3.1", "v2.3.1", "v2.3.1", "v2.3.1", "v2.3.1"),
                            },
                            {
                                label: L("版本列表", "版本列表", "Version list", "バージョン一覧", "버전 목록", "Liste des versions"),
                                control: "select",
                                value: L("倒序", "倒序", "Newest first", "新しい順", "최신순", "Récent d'abord"),
                            },
                        ],
                    },
                    {
                        title: L("安全模式", "安全模式", "Safe mode", "セーフモード", "안전 모드", "Mode sûr"),
                        rows: [
                            {
                                label: L("安全模式", "安全模式", "Safe mode", "セーフモード", "안전 모드", "Mode sûr"),
                                control: "toggle",
                                on: true,
                            },
                            {
                                label: L(
                                    "隐藏解包入口",
                                    "隱藏解包入口",
                                    "Hide unpack entry",
                                    "解包入口を隠す",
                                    "언팩 입구 숨기기",
                                    "Masquer l'entrée unpack"
                                ),
                                control: "toggle",
                                on: true,
                            },
                            {
                                label: L("版本门控", "版本門檻", "Version gate", "バージョン制限", "버전 제한", "Seuil de version"),
                                control: "select",
                                value: L("> 1.7", "> 1.7", "> 1.7", "> 1.7", "> 1.7", "> 1.7"),
                            },
                            {
                                label: L("关闭方式", "關閉方式", "Unlock method", "解除方法", "해제 방식", "Déverrouillage"),
                                control: "select",
                                value: L(
                                    "3 题 + 密码",
                                    "3 題 + 密碼",
                                    "3 questions + password",
                                    "3問 + パスワード",
                                    "3문제 + 비밀번호",
                                    "3 questions + mot de passe"
                                ),
                            },
                        ],
                    },
                ],
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "设置里能看当前版本；来源和版本列表就在这里。",
                        "設定裡能看目前版本；來源和版本列表就在這裡。",
                        "Settings shows the current version; source and version list live here.",
                        "設定で現在のバージョンを確認。ソースとバージョン一覧もここです。",
                        "설정에서 현재 버전을 봅니다. 소스와 버전 목록도 여기 있습니다.",
                        "Les réglages montrent la version ; source et liste sont ici."
                    ),
                },
                {
                    at: 5.0,
                    text: L(
                        "安全模式默认开启：隐藏解包，过滤 1.7 以上的数据。",
                        "安全模式預設開啟：隱藏解包，過濾 1.7 以上的資料。",
                        "Safe mode is on by default: it hides unpack and filters data above 1.7.",
                        "セーフモードは既定で有効。解包を隠し、1.7 超のデータを除外します。",
                        "안전 모드는 기본으로 켜져 있으며 언팩을 숨기고 1.7 초과 데이터를 거릅니다.",
                        "Mode sûr actif par défaut : masque unpack et filtre les données > 1.7."
                    ),
                },
            ],
            note: L(
                "安全模式全平台生效；解包入口仅桌面端",
                "安全模式全平台生效；解包入口僅桌面端",
                "Safe mode applies everywhere; the unpack entry is desktop-only",
                "セーフモードは全環境で有効。解包入口のみデスクトップ限定",
                "안전 모드는 모든 환경에 적용되며 언팩 입구만 데스크톱 전용",
                "Mode sûr partout ; l'entrée unpack est réservée au desktop"
            ),
        },
        {
            id: "safe-mode",
            chapter: L("安全模式", "安全模式", "Safe mode", "セーフモード", "안전 모드", "Mode sûr"),
            duration: 8,
            shot: {
                type: "callout",
                kicker: "SAFE MODE",
                icon: "ri:shield-check-line",
                title: L(
                    "关闭安全模式要答题",
                    "關閉安全模式要答題",
                    "Closing safe mode requires a quiz",
                    "セーフモード解除にはクイズ",
                    "안전 모드 해제에는 퀴즈",
                    "Fermer le mode sûr exige un quiz"
                ),
                points: [
                    {
                        icon: "ri:question-line",
                        text: L(
                            "3 道题：2 道选择 + 1 道填空，随机抽取。",
                            "3 道題：2 道選擇 + 1 道填空，隨機抽取。",
                            "Three questions: two multiple-choice and one fill-in, drawn at random.",
                            "3問：選択2問＋記述1問をランダムに出題。",
                            "3문제: 선택 2개 + 주관식 1개를 무작위로 출제.",
                            "Trois questions : deux QCM et une à compléter, tirées au hasard."
                        ),
                    },
                    {
                        icon: "ri:lock-line",
                        text: L(
                            "再输入当期解锁密码（服务端密码包）。",
                            "再輸入當期解鎖密碼（伺服器密碼包）。",
                            "Then enter the current unlock password (server password pack).",
                            "さらに当期の解除パスワードを入力（サーバーのパスワードパック）。",
                            "이어서当期 해제 비밀번호를 입력합니다(서버 비밀번호 팩).",
                            "Puis saisissez le mot de passe courant (pack serveur)."
                        ),
                    },
                    {
                        icon: "ri:time-line",
                        text: L(
                            "失败冷却 5 分钟；全部通过后重载。",
                            "失敗冷卻 5 分鐘；全部通過後重載。",
                            "A failure triggers a 5-minute cooldown; passing reloads the app.",
                            "失敗で5分間クールダウン。全通過で再読み込みします。",
                            "실패하면 5분 대기하며, 모두 통과하면 새로 고칩니다.",
                            "Échec : pause de 5 minutes ; succès : rechargement."
                        ),
                    },
                ],
                note: L(
                    "密码包从分享链接转存后抄写，每期轮换",
                    "密碼包從分享連結轉存後抄寫，每期輪換",
                    "Grab the password from the shared pack; it rotates every period",
                    "パスワードは共有リンクのパックから。毎期更新されます",
                    "비밀번호는 공유 링크의 팩에서 확인하며 매 기간 갱신됩니다",
                    "Mot de passe dans le pack partagé, renouvelé à chaque période"
                ),
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "安全模式不是普通开关：关闭要答对 3 道题。",
                        "安全模式不是普通開關：關閉要答對 3 道題。",
                        "Safe mode is not a plain switch: closing it means passing three questions.",
                        "セーフモードは普通のスイッチではありません。解除には3問の正解が必要です。",
                        "안전 모드는 일반 스위치가 아닙니다. 해제하려면 3문제를 맞혀야 합니다.",
                        "Le mode sûr n'est pas un simple interrupteur : trois questions à réussir."
                    ),
                },
                {
                    at: 4.6,
                    text: L(
                        "再输入当期密码；失败冷却 5 分钟，通过后自动重载。",
                        "再輸入當期密碼；失敗冷卻 5 分鐘，通過後自動重載。",
                        "Enter the current password; failure pauses 5 minutes, success reloads.",
                        "当期パスワードを入力。失敗は5分待機、成功で自動再読み込み。",
                        "현재 비밀번호를 입력하세요. 실패 시 5분 대기, 통과 시 자동 새로 고침.",
                        "Saisissez le mot de passe ; échec 5 min, succès recharge."
                    ),
                },
            ],
        },
        {
            id: "recap",
            chapter: L("回顾", "回顧", "Recap", "まとめ", "정리", "Récapitulatif"),
            duration: 8,
            shot: {
                type: "recap",
                title: L(
                    "把界面调成你的",
                    "把介面調成你的",
                    "Make the interface yours",
                    "見た目を自分好みに",
                    "화면을 내 스타일로",
                    "Une interface à vous"
                ),
                checklist: [
                    L(
                        "主题、底图、字体、缩放、语言；语言即时生效",
                        "主題、底圖、字型、縮放、語言；語言即時生效",
                        "Theme, wallpaper, font, scale, language — language applies instantly",
                        "テーマ・壁紙・フォント・拡大率・言語。言語は即時反映",
                        "테마, 배경, 글꼴, 배율, 언어. 언어는 즉시 적용",
                        "Thème, fond, police, échelle, langue — application immédiate"
                    ),
                    L(
                        "侧边栏可增删排序，首页与 More 锁定",
                        "側邊欄可增刪排序，首頁與 More 鎖定",
                        "Sidebar items can be added, removed, sorted; Home and More are locked",
                        "サイドバーは追加・削除・並べ替え可能。ホームと More は固定",
                        "사이드바는 추가/삭제/정렬 가능, 홈과 More는 고정",
                        "Barre latérale modifiable ; Home et More verrouillés"
                    ),
                    L(
                        "数据包可换源、回滚；安全模式默认开启",
                        "資料包可換源、回滾；安全模式預設開啟",
                        "Packs switch sources and roll back; safe mode is on by default",
                        "パックはソース切替とロールバック、セーフモードは既定で有効",
                        "팩은 소스 전환/롤백, 안전 모드는 기본 켜짐",
                        "Pack : sources et retour ; mode sûr actif par défaut"
                    ),
                ],
                route: "/setting",
                routeLabel: L("打开设置", "開啟設定", "Open Settings", "設定を開く", "설정 열기", "Ouvrir les réglages"),
                hint: L(
                    "下一步：把常用入口放进侧边栏",
                    "下一步：把常用入口放進側邊欄",
                    "Next: pin your frequent entries to the sidebar",
                    "次へ：よく使う入口をサイドバーへ",
                    "다음: 자주 쓰는 항목을 사이드바에",
                    "Ensuite : épinglez vos entrées fréquentes"
                ),
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "现在去设置页，先换一张喜欢的底图。",
                        "現在去設定頁，先換一張喜歡的底圖。",
                        "Now open Settings and start with a wallpaper you like.",
                        "設定を開いて、好きな壁紙から始めましょう。",
                        "설정을 열고 마음에 드는 배경부터 바꿔 보세요.",
                        "Ouvrez les réglages et choisissez d'abord un fond."
                    ),
                },
            ],
        },
    ],
}
