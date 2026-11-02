import { L, type Tutorial } from "../types"

export const desktopTutorial: Tutorial = {
    id: "desktop",
    number: "09",
    category: "desktop",
    title: L("桌面端能力", "桌面端能力", "Desktop capabilities", "デスクトップ機能", "데스크톱 기능", "Capacités du bureau"),
    subtitle: L(
        "启动器更新、狩月账本与米家浮窗。",
        "啟動器更新、狩獵帳本與米家浮窗。",
        "Launcher updates, the AFK Ledger, and Mi Home widgets.",
        "ランチャー更新、狩猟帳簿、Mi Homeウィジェット。",
        "런처 업데이트, 사냥 장부, Mi Home 위젯.",
        "Mises à jour du lanceur, Journal de chasse et widgets Mi Home."
    ),
    summary: L(
        "桌面端独有的三件套：启动器负责检测、更新与启动，游戏设置控制 DX11 与 MOD；狩月账本把挂机掉落变成可筛选的本地账本；米家规则和独立小窗负责自动化。账号、路径与管道都标清边界。",
        "桌面端獨有的三件套：啟動器負責偵測、更新與啟動，遊戲設定控制 DX11 與 MOD；狩獵帳本把掛機掉落變成可篩選的本地帳本；米家規則和獨立小窗負責自動化。路徑、管道與啟動邊界都標清。",
        "Three desktop-only systems: the launcher detects, updates, and starts the game while settings control DX11 and mods; the AFK Ledger turns idle drops into a filterable local ledger; Mi Home rules and the floating widget handle automation. Paths, pipes, and launch limits are all spelled out.",
        "デスクトップ専用の3系統。ランチャーの検出・更新・起動、DX11とMODの設定、狩猟帳簿の記録、Mi Homeルールと小窓の自動化。パス・パイプ・起動の境界も明記します。",
        "데스크톱 전용 세 가지: 런처의 감지·업데이트·실행, DX11/MOD 설정, 사냥 장부 기록, Mi Home 규칙과 위젯 자동화. 경로, 파이프, 실행 경계도 분명히 짚습니다.",
        "Trois systèmes réservés au bureau : le lanceur détecte, met à jour et démarre le jeu, les réglages contrôlent DX11 et les mods, le Journal de chasse filtre les butins d'inactivité, et les règles Mi Home avec le widget gèrent l'automatisation. Chemins, canaux et limites de lancement sont précisés."
    ),
    icon: "ri:windows-fill",
    accent: "#7f00ff",
    route: "/game-launcher",
    routeLabel: L(
        "打开游戏启动器",
        "開啟遊戲啟動器",
        "Open game launcher",
        "ゲームランチャーを開く",
        "게임 런처 열기",
        "Ouvrir le lanceur"
    ),
    platforms: ["app"],
    scenes: [
        {
            id: "intro",
            chapter: L("开场", "開場", "Intro", "導入", "인트로", "Intro"),
            duration: 5,
            shot: {
                type: "title",
                variant: "intro",
                kicker: L(
                    "EP 09 · 桌面端",
                    "EP 09 · 桌面端",
                    "EP 09 · DESKTOP",
                    "EP 09 · デスクトップ",
                    "EP 09 · 데스크톱",
                    "EP 09 · BUREAU"
                ),
                title: L("桌面端能力", "桌面端能力", "Desktop capabilities", "デスクトップ機能", "데스크톱 기능", "Capacités du bureau"),
                subtitle: L(
                    "启动器、账本、米家与小窗，串成一条桌面流水线。",
                    "啟動器、帳本、米家與小窗，串成一條桌面流水線。",
                    "Launcher, ledger, Mi Home, and widget: one desktop pipeline.",
                    "ランチャー、帳簿、Mi Home、小窓をひとつの流れに。",
                    "런처, 장부, Mi Home, 위젯을 하나의 흐름으로.",
                    "Lanceur, registre, Mi Home et widget : un seul flux."
                ),
                icon: "ri:windows-fill",
                index: "09",
            },
            captions: [
                {
                    at: 0.9,
                    text: L(
                        "这些功能只在桌面客户端出现；网页端看不到完整入口。",
                        "這些功能只在桌面用戶端出現；網頁端看不到完整入口。",
                        "These features live in the desktop app; the web build has no full entry point.",
                        "これらはデスクトップ版のみ。Web版には完全な入口がありません。",
                        "이 기능은 데스크톱 앱에만 있으며 웹에는 전체 진입점이 없습니다.",
                        "Ces fonctions sont réservées au bureau ; le web n'a pas l'entrée complète."
                    ),
                },
            ],
        },
        {
            id: "launcher-update",
            chapter: L("启动器更新", "啟動器更新", "Launcher update", "ランチャー更新", "런처 업데이트", "Mise à jour"),
            duration: 10,
            shot: {
                type: "launcher",
                mode: "update",
                title: L(
                    "下载更新",
                    "下載更新",
                    "Download & update",
                    "ダウンロード更新",
                    "다운로드 및 업데이트",
                    "Télécharger et mettre à jour"
                ),
                subtitle: L(
                    "版本卡：旧版 · 优先差分更新",
                    "版本卡：舊版 · 優先差分更新",
                    "Version card: old build · prefer diff updates",
                    "バージョンカード：旧版・差分優先",
                    "버전 카드: 이전 버전 · 차분 우선",
                    "Carte de version : ancienne · diff prioritaire"
                ),
                progress: {
                    label: L(
                        "正在下载资源",
                        "正在下載資源",
                        "Downloading resources",
                        "リソースをダウンロード中",
                        "리소스 다운로드 중",
                        "Téléchargement des ressources"
                    ),
                    value: 0.72,
                },
                status: L(
                    "下载中 · 12.6 MB/s · 可暂停",
                    "下載中 · 12.6 MB/s · 可暫停",
                    "Downloading · 12.6 MB/s · pausable",
                    "ダウンロード中・12.6 MB/s・一時停止可",
                    "다운로드 중 · 12.6 MB/s · 일시 정지 가능",
                    "Téléchargement · 12,6 Mo/s · pausable"
                ),
                steps: [
                    {
                        label: L(
                            "检测安装路径",
                            "偵測安裝路徑",
                            "Detect install path",
                            "インストール先を検出",
                            "설치 경로 감지",
                            "Détection du chemin"
                        ),
                        done: true,
                    },
                    {
                        label: L(
                            "差分 v1.8.0 → v1.9.0",
                            "差分 v1.8.0 → v1.9.0",
                            "Diff v1.8.0 → v1.9.0",
                            "差分 v1.8.0 → v1.9.0",
                            "차분 v1.8.0 → v1.9.0",
                            "Diff v1.8.0 → v1.9.0"
                        ),
                        done: true,
                    },
                    {
                        label: L(
                            "下载资源",
                            "下載資源",
                            "Download resources",
                            "リソースをダウンロード",
                            "리소스 다운로드",
                            "Télécharger les ressources"
                        ),
                    },
                ],
                actions: [
                    L("暂停", "暫停", "Pause", "一時停止", "일시 정지", "Pause"),
                    L("更新游戏", "更新遊戲", "Update game", "ゲームを更新", "게임 업데이트", "Mettre à jour"),
                ],
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "没检测到路径时点修改，选包含 DNA Game 的父目录。",
                        "沒偵測到路徑時點修改，選包含 DNA Game 的父目錄。",
                        "If no path is detected, click Change and pick the parent folder containing DNA Game.",
                        "パスが未検出なら「変更」を押し、DNA Gameを含む親フォルダを選びます。",
                        "경로가 감지되지 않으면 변경을 눌러 DNA Game이 있는 상위 폴더를 고르세요.",
                        "Sans chemin détecté, cliquez sur Modifier et choisissez le dossier parent contenant DNA Game."
                    ),
                },
                {
                    at: 5.2,
                    text: L(
                        "正式服、下载节点和线程可选；差分包优先，失败回退完整包。",
                        "正式服、下載節點和執行緒可選；差分套件優先，失敗回退完整包。",
                        "Pick server, download node, and threads. Diffs come first; failure falls back to the full package.",
                        "サーバー・ノード・スレッドを選択。差分を優先し、失敗時は完全版へ戻ります。",
                        "서버, 다운로드 노드, 스레드를 선택합니다. 차분을 우선하고 실패하면 전체 패키지로 돌아갑니다.",
                        "Choisissez serveur, nœud et fils. Le diff passe d'abord ; en cas d'échec, retour au paquet complet."
                    ),
                },
            ],
            callouts: [
                {
                    at: 2.8,
                    text: L("自动检测路径", "自動偵測路徑", "Auto-detected path", "パスを自動検出", "경로 자동 감지", "Chemin détecté"),
                    x: 28,
                    y: 26,
                },
                {
                    at: 7,
                    text: L("差分 v… → v…", "差分 v… → v…", "Diff v… → v…", "差分 v… → v…", "차분 v… → v…", "Diff v… → v…"),
                    x: 60,
                    y: 44,
                },
            ],
            note: L("仅桌面端", "僅桌面端", "Desktop only", "デスクトップのみ", "데스크톱 전용", "Bureau uniquement"),
        },
        {
            id: "launcher-ready",
            chapter: L("游戏就绪", "遊戲就緒", "Game ready", "ゲーム準備完了", "게임 준비", "Jeu prêt"),
            duration: 7,
            shot: {
                type: "launcher",
                mode: "game",
                title: L("游戏已就绪", "遊戲已就緒", "Game ready", "ゲーム準備完了", "게임 준비 완료", "Jeu prêt"),
                subtitle: L(
                    "解压进度显示为模拟曲线",
                    "解壓進度顯示為模擬曲線",
                    "Extraction progress is simulated",
                    "解凍進度はシミュレーション",
                    "압축 해제 진행률은 모의 값",
                    "Progression d'extraction simulée"
                ),
                progress: {
                    label: L(
                        "正在解压资源",
                        "正在解壓資源",
                        "Extracting resources",
                        "リソースを解凍中",
                        "리소스 압축 해제 중",
                        "Extraction des ressources"
                    ),
                    value: 1,
                },
                status: L("游戏已就绪", "遊戲已就緒", "Game ready", "ゲーム準備完了", "게임 준비 완료", "Jeu prêt"),
                steps: [
                    { label: L("检查版本", "檢查版本", "Check version", "バージョン確認", "버전 확인", "Vérifier la version"), done: true },
                    {
                        label: L(
                            "下载资源",
                            "下載資源",
                            "Download resources",
                            "リソースをダウンロード",
                            "리소스 다운로드",
                            "Télécharger les ressources"
                        ),
                        done: true,
                    },
                    {
                        label: L(
                            "解压资源",
                            "解壓資源",
                            "Extract resources",
                            "リソースを解凍",
                            "리소스 압축 해제",
                            "Extraire les ressources"
                        ),
                        done: true,
                    },
                ],
                actions: [L("启动游戏", "啟動遊戲", "Launch game", "ゲームを起動", "게임 시작", "Lancer le jeu")],
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "解压阶段显示的是模拟进度，真实信息看文件计数与大小。",
                        "解壓階段顯示的是模擬進度，真實資訊看檔案計數與大小。",
                        "The extraction bar is simulated; real progress shows in file count and size.",
                        "解凍バーはシミュレーション。実際の情報はファイル数とサイズで確認します。",
                        "압축 해제 표시는 모의 진행률이며 실제 정보는 파일 수와 크기로 확인합니다.",
                        "La barre d'extraction est simulée ; les vrais chiffres sont le nombre et la taille des fichiers."
                    ),
                },
                {
                    at: 4.4,
                    text: L(
                        "校验通过后按钮变游戏已就绪，点启动游戏即可。",
                        "校驗通過後按鈕變遊戲已就緒，點啟動遊戲即可。",
                        "When validation passes, the button becomes Game ready; click Launch game.",
                        "検証が通ると「ゲーム準備完了」になり、「ゲームを起動」を押せます。",
                        "검증을 통과하면 게임 준비 완료가 되고 게임 시작을 누를 수 있습니다.",
                        "Une fois la vérification passée, le bouton devient Jeu prêt ; cliquez sur Lancer le jeu."
                    ),
                },
            ],
            callouts: [
                {
                    at: 2.2,
                    text: L(
                        "解压进度为模拟值",
                        "解壓進度為模擬值",
                        "Extraction is simulated",
                        "解凍はシミュレーション",
                        "압축 해제는 모의 값",
                        "Extraction simulée"
                    ),
                    x: 52,
                    y: 56,
                },
                { at: 5.2, text: L("启动游戏", "啟動遊戲", "Launch game", "ゲームを起動", "게임 시작", "Lancer le jeu"), x: 80, y: 82 },
            ],
            note: L("仅桌面端", "僅桌面端", "Desktop only", "デスクトップのみ", "데스크톱 전용", "Bureau uniquement"),
        },
        {
            id: "launch-boundary",
            chapter: L("启动边界", "啟動邊界", "Launch boundaries", "起動の境界", "실행 경계", "Limites de lancement"),
            duration: 8.5,
            shot: {
                type: "callout",
                kicker: "NO STOP BUTTON",
                title: L(
                    "启动器的边界",
                    "啟動器的邊界",
                    "What the launcher cannot do",
                    "ランチャーの限界",
                    "런처의 한계",
                    "Ce que le lanceur ne fait pas"
                ),
                icon: "ri:error-warning-line",
                points: [
                    {
                        text: L(
                            "没有停止游戏按钮，只能启动并检测运行状态。",
                            "沒有停止遊戲按鈕，只能啟動並偵測執行狀態。",
                            "There is no stop button: it can only launch and detect the running state.",
                            "ゲーム停止ボタンはなく、起動と実行状態の検出だけです。",
                            "게임 중지 버튼은 없고 실행과 상태 감지만 가능합니다.",
                            "Pas de bouton d'arrêt : le lanceur démarre et détecte l'état, rien de plus."
                        ),
                    },
                    {
                        text: L(
                            "启动后执行（afterGame）在游戏启动后立刻运行，不是退出后。",
                            "啟動後執行（afterGame）在遊戲啟動後立刻執行，不是退出後。",
                            "afterGame runs immediately after launch, not after the game exits.",
                            "afterGameは起動直後に実行され、終了後ではありません。",
                            "afterGame은 게임 시작 직후 실행되며 종료 후가 아닙니다.",
                            "afterGame s'exécute juste après le lancement, pas à la fermeture."
                        ),
                    },
                    {
                        text: L(
                            "顶部启动按钮只看游戏是否在运行，不强制等更新完成。",
                            "頂部啟動按鈕只看遊戲是否在執行，不強制等更新完成。",
                            "The top launch button only checks whether the game is running, not update completion.",
                            "上部の起動ボタンは実行状態だけを見て、更新完了は待ちません。",
                            "상단 시작 버튼은 실행 여부만 확인하며 업데이트 완료를 기다리지 않습니다.",
                            "Le bouton de lancement vérifie seulement si le jeu tourne, pas la fin des mises à jour."
                        ),
                    },
                ],
                note: L(
                    "把这三条当成硬边界",
                    "把這三條當成硬邊界",
                    "Treat these as hard limits",
                    "この3つは固定の制約です",
                    "세 가지는 확실한 경계입니다",
                    "Trois limites à retenir"
                ),
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "启动器没有停止按钮，只能启动游戏并检测运行状态。",
                        "啟動器沒有停止按鈕，只能啟動遊戲並偵測執行狀態。",
                        "There is no stop button; the launcher only starts the game and detects it running.",
                        "停止ボタンはありません。起動と実行状態の検出だけです。",
                        "중지 버튼은 없으며 게임 시작과 실행 상태 감지만 합니다.",
                        "Pas de bouton d'arrêt : le lanceur démarre et détecte l'état du jeu."
                    ),
                },
                {
                    at: 4.6,
                    text: L(
                        "afterGame 是启动后立刻执行，不是退出后执行。",
                        "afterGame 是啟動後立刻執行，不是退出後執行。",
                        "afterGame runs right after launch, not after exit.",
                        "afterGameは起動直後の実行で、終了後ではありません。",
                        "afterGame은 시작 직후 실행되며 종료 후가 아닙니다.",
                        "afterGame s'exécute après le lancement, pas après la fermeture."
                    ),
                },
            ],
            note: L("仅桌面端", "僅桌面端", "Desktop only", "デスクトップのみ", "데스크톱 전용", "Bureau uniquement"),
        },
        {
            id: "game-settings",
            chapter: L("游戏设置", "遊戲設定", "Game settings", "ゲーム設定", "게임 설정", "Réglages du jeu"),
            duration: 9,
            shot: {
                type: "settings",
                title: L("游戏设置", "遊戲設定", "Game settings", "ゲーム設定", "게임 설정", "Réglages du jeu"),
                nav: [
                    { label: L("下载更新", "下載更新", "Update", "更新", "업데이트", "Mise à jour") },
                    { label: L("游戏设置", "遊戲設定", "Game settings", "ゲーム設定", "게임 설정", "Réglages du jeu") },
                    { label: L("账号管理", "帳號管理", "Accounts", "アカウント", "계정 관리", "Comptes") },
                ],
                activeNav: 1,
                sections: [
                    {
                        title: L("游戏选项", "遊戲選項", "Game options", "ゲームオプション", "게임 옵션", "Options du jeu"),
                        rows: [
                            {
                                label: L("启用DX11", "啟用DX11", "Enable DX11", "DX11を有効化", "DX11 사용", "Activer DX11"),
                                control: "toggle",
                                on: true,
                            },
                            {
                                label: L("启用MOD", "啟用MOD", "Enable MOD", "MODを有効化", "MOD 사용", "Activer les MOD"),
                                control: "toggle",
                                on: true,
                            },
                            {
                                label: L("加载器", "載入器", "Loader", "ローダー", "로더", "Chargeur"),
                                control: "select",
                                value: L("Legacy", "Legacy", "Legacy", "Legacy", "Legacy", "Legacy"),
                            },
                        ],
                    },
                    {
                        title: L(
                            "画面与性能",
                            "畫面與效能",
                            "Graphics & performance",
                            "グラフィックと性能",
                            "화면 및 성능",
                            "Graphismes et performances"
                        ),
                        rows: [
                            {
                                label: L("分辨率", "解析度", "Resolution", "解像度", "해상도", "Résolution"),
                                control: "select",
                                value: L("1920 × 1080", "1920 × 1080", "1920 × 1080", "1920 × 1080", "1920 × 1080", "1920 × 1080"),
                            },
                            {
                                label: L(
                                    "性能预设",
                                    "效能預設",
                                    "Performance preset",
                                    "パフォーマンスプリセット",
                                    "성능 프리셋",
                                    "Préréglage performance"
                                ),
                                control: "select",
                                value: L("高", "高", "High", "高", "높음", "Élevé"),
                            },
                            {
                                label: L("帧率限制", "幀率限制", "FPS limit", "FPS制限", "프레임 제한", "Limite FPS"),
                                control: "select",
                                value: "120",
                            },
                        ],
                    },
                    {
                        title: L(
                            "桌面快捷方式",
                            "桌面捷徑",
                            "Desktop shortcut",
                            "デスクトップショートカット",
                            "바탕 화면 바로가기",
                            "Raccourci bureau"
                        ),
                        rows: [
                            {
                                label: L(
                                    "创建快捷方式",
                                    "建立捷徑",
                                    "Create shortcut",
                                    "ショートカットを作成",
                                    "바로가기 만들기",
                                    "Créer un raccourci"
                                ),
                                control: "toggle",
                                on: true,
                            },
                            {
                                label: L(
                                    "快捷方式位置",
                                    "捷徑位置",
                                    "Shortcut location",
                                    "ショートカットの場所",
                                    "바로가기 위치",
                                    "Emplacement du raccourci"
                                ),
                                control: "select",
                                value: L(
                                    "桌面 · 二重螺旋.lnk",
                                    "桌面 · 二重螺旋.lnk",
                                    "Desktop · Duet Night Abyss.lnk",
                                    "デスクトップ・二重螺旋.lnk",
                                    "바탕 화면 · 二重螺旋.lnk",
                                    "Bureau · Duet Night Abyss.lnk"
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
                        "游戏设置里可开 DX11、启用 MOD，加载器只有 Legacy。",
                        "遊戲設定裡可開 DX11、啟用 MOD，載入器只有 Legacy。",
                        "Game settings toggle DX11 and MOD; the only loader is Legacy.",
                        "ゲーム設定でDX11とMODを有効化。ローダーはLegacyのみです。",
                        "게임 설정에서 DX11과 MOD를 켤 수 있고 로더는 Legacy뿐입니다.",
                        "Les réglages activent DX11 et les MOD ; le seul chargeur est Legacy."
                    ),
                },
                {
                    at: 4.8,
                    text: L(
                        "Legacy 会追加 -fileopenlog，可能卡顿；快捷方式名为二重螺旋。",
                        "Legacy 會追加 -fileopenlog，可能卡頓；捷徑名為二重螺旋。",
                        "Legacy adds -fileopenlog and may stutter; the shortcut is named Duet Night Abyss.",
                        "Legacyは-fileopenlogを追加し、重くなる場合があります。ショートカット名は「二重螺旋」。",
                        "Legacy는 -fileopenlog를 추가해 끊길 수 있습니다. 바로가기 이름은 二重螺旋입니다.",
                        "Legacy ajoute -fileopenlog et peut saccader ; le raccourci s'appelle Duet Night Abyss."
                    ),
                },
            ],
            note: L("仅桌面端", "僅桌面端", "Desktop only", "デスクトップのみ", "데스크톱 전용", "Bureau uniquement"),
        },
        {
            id: "mod-tabs",
            chapter: L("MOD 管理", "MOD 管理", "MOD management", "MOD管理", "MOD 관리", "Gestion des MOD"),
            duration: 8.5,
            shot: {
                type: "cards",
                kicker: "MOD MANAGER",
                title: L(
                    "MOD 管理的五个 tab",
                    "MOD 管理的五個 tab",
                    "Five tabs in MOD management",
                    "MOD管理の5タブ",
                    "MOD 관리의 다섯 탭",
                    "Cinq onglets de gestion"
                ),
                variant: "tiles",
                items: [
                    {
                        title: L("分享", "分享", "Share", "共有", "공유", "Partager"),
                        subtitle: L(
                            "在线商店与「我的发布」",
                            "線上商店與「我的發佈」",
                            "Online store and My posts",
                            "オンラインストアと「マイ投稿」",
                            "온라인 상점과 내 게시물",
                            "Boutique et mes publications"
                        ),
                        icon: "ri:shopping-bag-4-line",
                    },
                    {
                        title: L("角色", "角色", "Character", "キャラ", "캐릭터", "Personnage"),
                        subtitle: L(
                            "一个角色只能选一个 MOD",
                            "一個角色只能選一個 MOD",
                            "One MOD per character",
                            "1キャラにつき1 MOD",
                            "캐릭터 하나에 MOD 하나",
                            "Un MOD par personnage"
                        ),
                        icon: "ri:user-line",
                    },
                    {
                        title: L("武器", "武器", "Weapon", "武器", "무기", "Arme"),
                        subtitle: L(
                            "一个武器只能选一个 MOD",
                            "一個武器只能選一個 MOD",
                            "One MOD per weapon",
                            "1武器につき1 MOD",
                            "무기 하나에 MOD 하나",
                            "Un MOD par arme"
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
                            "Entités personnalisées, aussi en choix unique"
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
                highlightAt: 5.6,
                highlightLabel: L("可多选", "可多選", "Multi-select", "複数選択", "다중 선택", "Choix multiple"),
                footnote: L(
                    "实体 MOD 单选 · 独立 MOD 多选",
                    "實體 MOD 單選 · 獨立 MOD 多選",
                    "Entity MODs single-select · standalone multi-select",
                    "実体MODは単一・独立MODは複数",
                    "엔티티 MOD 단일 · 독립 MOD 다중",
                    "MOD d'entité en choix unique · autonomes en multiple"
                ),
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "角色、武器、自定义是单选，一个实体只能挂一个 MOD。",
                        "角色、武器、自訂是單選，一個實體只能掛一個 MOD。",
                        "Character, weapon, and custom are single-select: one entity, one MOD.",
                        "キャラ・武器・カスタムは単一選択で、1実体につき1 MODです。",
                        "캐릭터, 무기, 사용자 정의는 단일 선택으로 한 항목에 MOD 하나입니다.",
                        "Personnage, arme et personnalisé sont en choix unique : une entité, un MOD."
                    ),
                },
                {
                    at: 4.4,
                    text: L(
                        "独立 MOD 可以多选；导入后默认是禁用状态。",
                        "獨立 MOD 可以多選；匯入後預設是停用狀態。",
                        "Standalone MODs allow multiple selections; imports start disabled.",
                        "独立MODは複数選択可。取り込み後は無効状態です。",
                        "독립 MOD는 다중 선택이 가능하며, 가져온 뒤에는 기본 비활성입니다.",
                        "Les MOD autonomes se cumulent ; un import démarre désactivé."
                    ),
                },
            ],
            callouts: [
                {
                    at: 2.4,
                    text: L("实体单选", "實體單選", "Entity: single", "実体は単一", "엔티티 단일", "Entité : unique"),
                    x: 38,
                    y: 45,
                },
                {
                    at: 6.2,
                    text: L("独立多选", "獨立多選", "Standalone: multi", "独立は複数", "독립 다중", "Autonome : multiple"),
                    x: 80,
                    y: 45,
                },
            ],
            note: L("仅桌面端", "僅桌面端", "Desktop only", "デスクトップのみ", "데스크톱 전용", "Bureau uniquement"),
        },
        {
            id: "afk-ledger",
            chapter: L("狩月账本", "狩獵帳本", "AFK Ledger", "狩猟帳簿", "사냥 장부", "Journal de chasse"),
            duration: 11,
            shot: {
                type: "dashboard",
                kicker: L("AFK 账本", "AFK 帳本", "AFK LEDGER", "AFK 帳簿", "AFK 장부", "JOURNAL AFK"),
                title: L("狩月账本", "狩獵帳本", "AFK Ledger", "狩猟帳簿", "사냥 장부", "Journal de chasse"),
                stats: [
                    { label: L("完成场次", "完成場次", "Completed runs", "完了した周回", "완료한 판", "Sessions terminées"), value: "128" },
                    { label: L("总掉落", "總掉落", "Total drops", "総ドロップ", "총 드롭", "Butins totaux"), value: "1,204" },
                    {
                        label: L("金色掉落", "金色掉落", "Gold drops", "金ドロップ", "골드 드롭", "Butins dorés"),
                        value: "37",
                        accent: true,
                    },
                    {
                        label: L("场均掉落", "場均掉落", "Drops per run", "1周あたりドロップ", "판당 드롭", "Butins par session"),
                        value: "9.4",
                    },
                    { label: L("累计时长", "累計時長", "Total time", "累計時間", "누적 시간", "Temps total"), value: "26h" },
                ],
                chart: {
                    kind: "bars",
                    values: [12, 8, 15, 22, 18, 26, 20],
                    labels: [
                        L("周一", "週一", "Mon", "月", "월", "Lun"),
                        L("周二", "週二", "Tue", "火", "화", "Mar"),
                        L("周三", "週三", "Wed", "水", "수", "Mer"),
                        L("周四", "週四", "Thu", "木", "목", "Jeu"),
                        L("周五", "週五", "Fri", "金", "금", "Ven"),
                        L("周六", "週六", "Sat", "土", "토", "Sam"),
                        L("周日", "週日", "Sun", "日", "일", "Dim"),
                    ],
                },
                rows: [
                    {
                        label: L("最近场次", "最近場次", "Recent runs", "最近の周回", "최근 판", "Sessions récentes"),
                        value: "20",
                        meta: L(
                            "每页 · 倒序 · 掉落图标",
                            "每頁 · 倒序 · 掉落圖示",
                            "Per page · newest first · drop icons",
                            "1ページ・新しい順・ドロップアイコン",
                            "페이지당 · 최신순 · 드롭 아이콘",
                            "Par page · récentes · icônes"
                        ),
                    },
                    {
                        label: L("分布维度", "分佈維度", "Distribution", "分布の軸", "분포 기준", "Axes de répartition"),
                        value: "4",
                        meta: L(
                            "物品 / 副本 / 铸造 / 品质",
                            "物品 / 副本 / 鑄造 / 品質",
                            "Item / dungeon / craft / rarity",
                            "アイテム / ダンジョン / 製作 / レア度",
                            "아이템 / 던전 / 제작 / 등급",
                            "Objet / donjon / fabrication / rareté"
                        ),
                    },
                    {
                        label: L("导出", "匯出", "Export", "エクスポート", "내보내기", "Exporter"),
                        value: "JSON",
                        meta: L("导入为合并", "匯入為合併", "Imports merge", "取り込みは統合", "가져오기는 병합", "L'import fusionne"),
                    },
                    {
                        label: L(
                            "官方小小狩月人",
                            "官方小小狩月人",
                            "Official AFK Companion",
                            "公式「小さな狩月人」",
                            "공식 작은 수렵월인",
                            "AFK Compagnon officiel"
                        ),
                        value: "1 / 2",
                        meta: L(
                            "二选一 · 共用同一管道",
                            "二選一 · 共用同一管道",
                            "Either/or · same pipe",
                            "どちらか一方・同じパイプを共用",
                            "둘 중 하나 · 동일 파이프 공유",
                            "L'un ou l'autre · même canal"
                        ),
                    },
                ],
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "默认只看今天；采集默认关闭，需手动启用。",
                        "預設只看今天；採集預設關閉，需手動啟用。",
                        "It opens on Today; capture is off by default and must be enabled.",
                        "初期表示は「今日」。収集は既定でオフなので手動で有効化します。",
                        "기본은 오늘만 보기이며 수집은 기본 꺼짐이라 직접 켜야 합니다.",
                        "Vue par défaut : aujourd'hui. La capture est désactivée et doit être activée."
                    ),
                },
                {
                    at: 5.6,
                    text: L(
                        "与官方小小狩月人二选一；连接瞬间的积压回放会被直接丢弃。",
                        "與官方小小狩月人二選一；連線瞬間的積壓回放會被直接丟棄。",
                        "Use it or the official AFK Companion, never both. Buffered replay on connect is discarded.",
                        "公式「小さな狩月人」とは二択。接続直後の溜まった再生は破棄されます。",
                        "공식 AFK 컴패니언과는 둘 중 하나만. 연결 순간의 밀린 재생은 버려집니다.",
                        "Soit cet outil, soit l'AFK Compagnon officiel. La relecture en attente à la connexion est ignorée."
                    ),
                },
            ],
            callouts: [
                {
                    at: 2.4,
                    text: L(
                        "采集状态：已连接游戏",
                        "採集狀態：已連線遊戲",
                        "Capture: game connected",
                        "収集：ゲーム接続済み",
                        "수집: 게임 연결됨",
                        "Capture : jeu connecté"
                    ),
                    x: 24,
                    y: 18,
                },
                {
                    at: 7.6,
                    text: L(
                        "趋势 / 分布可点选筛选",
                        "趨勢 / 分佈可點選篩選",
                        "Click trend or distribution to filter",
                        "推移／分布をクリックで絞り込み",
                        "추이/분포 클릭으로 필터",
                        "Cliquez pour filtrer"
                    ),
                    x: 55,
                    y: 55,
                },
            ],
            note: L("仅桌面端", "僅桌面端", "Desktop only", "デスクトップのみ", "데스크톱 전용", "Bureau uniquement"),
        },
        {
            id: "automation-widget",
            chapter: L("自动化与小窗", "自動化與小窗", "Automation & widget", "自動化と小窓", "자동화와 위젯", "Automatisation et widget"),
            duration: 9.5,
            shot: {
                type: "callout",
                kicker: "MI HOME & WIDGET",
                title: L(
                    "自动化规则与小窗",
                    "自動化規則與小窗",
                    "Rules and the floating widget",
                    "ルールと小窓",
                    "규칙과 위젯",
                    "Règles et widget"
                ),
                icon: "ri:robot-2-line",
                points: [
                    {
                        text: L(
                            "米家插件需扫码登录；新建规则默认不勾「仅一次」。",
                            "米家外掛需掃碼登入；新建規則預設不勾「僅一次」。",
                            "The Mi Home plugin needs a QR login; new rules leave Fire once unchecked.",
                            "Mi HomeプラグインはQRログイン。新規ルールの「1回だけ」は既定でオフです。",
                            "Mi Home 플러그인은 QR 로그인이 필요하며, 새 규칙의 '한 번만'은 기본 꺼짐입니다.",
                            "Le plugin Mi Home exige un QR ; « une seule fois » est décoché par défaut."
                        ),
                    },
                    {
                        text: L(
                            "「立即执行」无视启用与仅一次，但仍受插件总开关约束。",
                            "「立即執行」無視啟用與僅一次，但仍受外掛總開關約束。",
                            "Run now ignores enabled and Fire once, but still obeys the plugin master switch.",
                            "「今すぐ実行」は有効化と「1回だけ」を無視しますが、プラグイン全体のスイッチには従います。",
                            "즉시 실행은 활성화와 '한 번만'을 무시하지만 플러그인 전체 스위치는 따릅니다.",
                            "Exécuter maintenant ignore l'activation et « une seule fois », mais pas l'interrupteur du plugin."
                        ),
                    },
                    {
                        text: L(
                            "独立小窗可拖动、关闭、置顶、鼠标穿透；穿透后回账本页点「解锁小窗」。",
                            "獨立小窗可拖動、關閉、置頂、滑鼠穿透；穿透後回帳本頁點「解鎖小窗」。",
                            "The widget can be dragged, closed, pinned, and made click-through; unlock it back on the ledger page.",
                            "小窓は移動・閉じる・最前面・マウス透過が可能。透過後は帳簿ページで「小窓を解除」します。",
                            "위젯은 이동, 닫기, 고정, 마우스 통과가 가능하며, 통과 후에는 장부 페이지에서 잠금을 풀어야 합니다.",
                            "Le widget se déplace, se ferme, se fixe et laisse passer la souris ; déverrouillez-le depuis la page du registre."
                        ),
                    },
                    {
                        text: L(
                            "蘑菇按钮可切换 BAD APPLE 剪影风格。",
                            "蘑菇按鈕可切換 BAD APPLE 剪影風格。",
                            "The mushroom button switches to the BAD APPLE silhouette style.",
                            "キノコボタンでBAD APPLEシルエットに切り替わります。",
                            "버섯 버튼으로 BAD APPLE 실루엣 스타일을 전환합니다.",
                            "Le bouton champignon passe au style silhouette BAD APPLE."
                        ),
                    },
                ],
                note: L(
                    "仅桌面端 · /afk-widget",
                    "僅桌面端 · /afk-widget",
                    "Desktop only · /afk-widget",
                    "デスクトップのみ · /afk-widget",
                    "데스크톱 전용 · /afk-widget",
                    "Bureau uniquement · /afk-widget"
                ),
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "米家插件要扫码登录；仅一次默认关闭，立即执行不看开关。",
                        "米家外掛要掃碼登入；僅一次預設關閉，立即執行不看開關。",
                        "Mi Home needs a QR login. Fire once starts off; Run now ignores the switches.",
                        "Mi HomeはQRログイン。「1回だけ」は既定オフ、今すぐ実行はスイッチを無視します。",
                        "Mi Home는 QR 로그인. '한 번만'은 기본 꺼짐이고 즉시 실행은 스위치를 무시합니다.",
                        "Mi Home exige un QR. « Une seule fois » est off ; Exécuter maintenant ignore les réglages."
                    ),
                },
                {
                    at: 5,
                    text: L(
                        "小窗穿透后自己点不到，必须回账本页解锁。",
                        "小窗穿透後自己點不到，必須回帳本頁解鎖。",
                        "A click-through widget cannot be clicked; unlock it from the ledger page.",
                        "マウス透過中の小窓はクリックできず、帳簿ページで解除します。",
                        "마우스 통과 중인 위젯은 클릭할 수 없어 장부 페이지에서 풀어야 합니다.",
                        "Un widget en transparence ne se clique plus : déverrouillez-le depuis le registre."
                    ),
                },
            ],
            note: L("仅桌面端", "僅桌面端", "Desktop only", "デスクトップのみ", "데스크톱 전용", "Bureau uniquement"),
        },
        {
            id: "recap",
            chapter: L("回顾", "回顧", "Recap", "まとめ", "정리", "Récapitulatif"),
            duration: 8.5,
            shot: {
                type: "recap",
                title: L(
                    "桌面端，把游戏流程接起来",
                    "桌面端，把遊戲流程接起來",
                    "Connect the whole desktop loop",
                    "デスクトップでゲームの流れをつなぐ",
                    "데스크톱에서 게임 흐름을 잇기",
                    "Reliez tout le flux sur le bureau"
                ),
                checklist: [
                    L(
                        "启动器：检测路径、差分更新、就绪后启动",
                        "啟動器：偵測路徑、差分更新、就緒後啟動",
                        "Launcher: detect path, diff update, launch when ready",
                        "ランチャー：検出・差分更新・準備完了後に起動",
                        "런처: 경로 감지, 차분 업데이트, 준비 후 시작",
                        "Lanceur : chemin, diff, lancement une fois prêt"
                    ),
                    L(
                        "游戏设置：DX11、启用 MOD、Legacy、桌面快捷方式",
                        "遊戲設定：DX11、啟用 MOD、Legacy、桌面捷徑",
                        "Settings: DX11, enable MOD, Legacy, desktop shortcut",
                        "設定：DX11・MOD有効化・Legacy・ショートカット",
                        "설정: DX11, MOD 사용, Legacy, 바로가기",
                        "Réglages : DX11, MOD, Legacy, raccourci"
                    ),
                    L(
                        "狩月账本：采集、KPI、趋势、导出 JSON",
                        "狩獵帳本：採集、KPI、趨勢、匯出 JSON",
                        "AFK Ledger: capture, KPIs, trends, JSON export",
                        "狩猟帳簿：収集・KPI・推移・JSON書き出し",
                        "사냥 장부: 수집, KPI, 추이, JSON 내보내기",
                        "Journal de chasse : capture, KPI, tendances, export JSON"
                    ),
                    L(
                        "米家规则与小窗：扫码登录、穿透后回主页面解锁",
                        "米家規則與小窗：掃碼登入、穿透後回主頁面解鎖",
                        "Mi Home rules and widget: QR login, unlock after click-through",
                        "Mi Homeルールと小窓：QRログイン・透過後の解除",
                        "Mi Home 규칙과 위젯: QR 로그인, 통과 후 잠금 해제",
                        "Règles Mi Home et widget : QR, déverrouillage après transparence"
                    ),
                ],
                route: "/game-launcher",
                routeLabel: L(
                    "打开游戏启动器",
                    "開啟遊戲啟動器",
                    "Open game launcher",
                    "ゲームランチャーを開く",
                    "게임 런처 열기",
                    "Ouvrir le lanceur"
                ),
                hint: L(
                    "技能 CD 浮窗与屏幕信息条也只在桌面端",
                    "技能 CD 浮窗與螢幕資訊條也只在桌面端",
                    "The skill CD overlay and screen bar are desktop-only too",
                    "スキルCD小窓と画面情報バーもデスクトップのみ",
                    "스킬 CD 위젯과 화면 정보 바도 데스크톱 전용입니다",
                    "Le widget CD et la barre d'infos sont aussi réservés au bureau"
                ),
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "这些能力只在桌面端；先把启动器和账本跑起来。",
                        "這些能力只在桌面端；先把啟動器和帳本跑起來。",
                        "These are desktop-only; start with the launcher and the ledger.",
                        "これらはデスクトップ専用。まずランチャーと帳簿から。",
                        "이 기능은 데스크톱 전용이며, 먼저 런처와 장부부터 시작하세요.",
                        "Tout cela est réservé au bureau ; commencez par le lanceur et le registre."
                    ),
                },
            ],
        },
    ],
}
