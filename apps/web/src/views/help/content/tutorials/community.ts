import { L, type Tutorial } from "../types"

export const communityTutorial: Tutorial = {
    id: "community",
    number: "11",
    category: "community",
    title: L("社区与攻略", "社群與攻略", "Community & Guides", "コミュニティと攻略", "커뮤니티와 공략", "Communauté et guides"),
    subtitle: L(
        "两套账号，一个社区",
        "兩套帳號，一個社群",
        "Two accounts, one community",
        "2つのアカウント、1つのコミュニティ",
        "두 개의 계정, 하나의 커뮤니티",
        "Deux comptes, une communauté"
    ),
    summary: L(
        "分清站内社区账号与皎皎角账号；在 /dna 签到、看公告与论坛；聊天、攻略、榜单和深渊使用率各走各的入口。",
        "分清站內社群帳號與皎皎角帳號；在 /dna 簽到、看公告與論壇；聊天、攻略、榜單和深淵使用率各走各的入口。",
        "Tell the site account and the Jiaojiao account apart; check in and read news and forums at /dna; chat, guides, ranking, and abyss usage each have their own entry.",
        "サイトアカウントと皎皎角アカウントを区別し、/dna で签到・お知らせ・フォーラム。チャット、攻略、ランキング、深淵使用率はそれぞれ別の入口です。",
        "사이트 계정과 쟈오쟈오 계정을 구분하고 /dna에서 출석, 공지, 포럼을 봅니다. 채팅, 공략, 순위, 심연 사용률은 각각 다른 입구입니다.",
        "Distinguez le compte du site et le compte Jiaojiao ; check-in, annonces et forum sur /dna ; chat, guides, classement et usage des abysses ont chacun leur entrée."
    ),
    icon: "ri:chat-3-line",
    accent: "#4facfe",
    route: "/dna",
    routeLabel: L("打开皎皎角", "開啟皎皎角", "Open Jiaojiao", "皎皎角を開く", "쟈오쟈오 열기", "Ouvrir Jiaojiao"),
    platforms: ["web", "login", "dna"],
    scenes: [
        {
            id: "intro",
            chapter: L("开场", "開場", "Intro", "導入", "인트로", "Intro"),
            duration: 5,
            shot: {
                type: "title",
                variant: "intro",
                kicker: L(
                    "EP 11 · 社区",
                    "EP 11 · 社群",
                    "EP 11 · COMMUNITY",
                    "EP 11 · コミュニティ",
                    "EP 11 · 커뮤니티",
                    "EP 11 · COMMUNAUTÉ"
                ),
                title: L("社区与攻略", "社群與攻略", "Community & Guides", "コミュニティと攻略", "커뮤니티와 공략", "Communauté et guides"),
                subtitle: L(
                    "先分清两套账号，再逛皎皎角。",
                    "先分清兩套帳號，再逛皎皎角。",
                    "Tell the two accounts apart, then explore Jiaojiao.",
                    "2つのアカウントを区別してから皎皎角へ。",
                    "두 계정을 구분한 뒤 쟈오쟈오로.",
                    "Distinguez les deux comptes, puis explorez Jiaojiao."
                ),
                icon: "ri:chat-3-line",
                index: "11",
            },
            captions: [
                {
                    at: 0.9,
                    text: L(
                        "社区功能很多，先记住：这里有两套账号。",
                        "社群功能很多，先記住：這裡有兩套帳號。",
                        "There are many community features; first remember: two accounts.",
                        "コミュニティ機能は多いです。まず覚えるのは2つのアカウント。",
                        "커뮤니티 기능이 많습니다. 먼저 기억할 것은 두 개의 계정입니다.",
                        "Beaucoup de fonctions ; retenez d'abord : deux comptes."
                    ),
                },
            ],
        },
        {
            id: "check-in",
            chapter: L("皎皎角", "皎皎角", "Jiaojiao", "皎皎角", "쟈오쟈오", "Jiaojiao"),
            duration: 10,
            shot: {
                type: "community",
                mode: "dna",
                title: L(
                    "皎皎角：签到与公告",
                    "皎皎角：簽到與公告",
                    "Jiaojiao: check-in and news",
                    "皎皎角：签到とお知らせ",
                    "쟈오쟈오: 출석과 공지",
                    "Jiaojiao : check-in et annonces"
                ),
                nav: [
                    { label: L("公告", "公告", "News", "お知らせ", "공지", "Annonces"), icon: "ri:information-line" },
                    { label: L("游戏信息", "遊戲資訊", "Game info", "ゲーム情報", "게임 정보", "Infos jeu"), icon: "ri:game-line" },
                    { label: L("论坛", "論壇", "Forum", "フォーラム", "포럼", "Forum"), icon: "ri:chat-thread-line" },
                    { label: L("签到", "簽到", "Check-in", "签到", "출석", "Check-in"), icon: "ri:calendar-check-line", active: true },
                ],
                stats: [
                    { label: L("已签到天数", "已簽到天數", "Days signed in", "签到日数", "출석 일수", "Jours signés"), value: "18" },
                    { label: L("自动签到", "自動簽到", "Auto check-in", "自動签到", "자동 출석", "Auto"), value: "ON" },
                ],
                checkIn: true,
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "皎皎角有公告、游戏信息、论坛和签到等页签。",
                        "皎皎角有公告、遊戲資訊、論壇和簽到等頁籤。",
                        "Jiaojiao has tabs for news, game info, forum, check-in, and more.",
                        "皎皎角にはお知らせ、ゲーム情報、フォーラム、签到などのタブがあります。",
                        "쟈오쟈오에는 공지, 게임 정보, 포럼, 출석 등의 탭이 있습니다.",
                        "Jiaojiao propose annonces, infos jeu, forum, check-in, etc."
                    ),
                },
                {
                    at: 5.2,
                    text: L(
                        "签到要皎皎角账号；打开自动签到，启动时就会检查。",
                        "簽到要皎皎角帳號；開啟自動簽到，啟動時就會檢查。",
                        "Check-in needs a Jiaojiao account; with auto on, it checks at startup.",
                        "签到には皎皎角アカウントが必要。自動签到をオンにすると起動時に確認します。",
                        "출석에는 쟈오쟈오 계정이 필요합니다. 자동 출석을 켜면 시작 시 확인합니다.",
                        "Check-in exige un compte Jiaojiao ; en auto, il vérifie au démarrage."
                    ),
                },
            ],
            callouts: [
                {
                    at: 3.6,
                    text: L("自动签到开关", "自動簽到開關", "Auto check-in", "自動签到スイッチ", "자동 출석 스위치", "Check-in auto"),
                    x: 62,
                    y: 76,
                },
            ],
            note: L(
                "需皎皎角账号（桌面端）",
                "需皎皎角帳號（桌面端）",
                "Jiaojiao account (desktop)",
                "皎皎角アカウントが必要（デスクトップ）",
                "쟈오쟈오 계정 필요(데스크톱)",
                "Compte Jiaojiao (desktop)"
            ),
        },
        {
            id: "two-accounts",
            chapter: L("两套账号", "兩套帳號", "Two accounts", "2つのアカウント", "두 계정", "Deux comptes"),
            duration: 8.5,
            shot: {
                type: "callout",
                kicker: "TWO ACCOUNTS",
                icon: "ri:user-line",
                title: L(
                    "站内账号 ≠ 皎皎角账号",
                    "站內帳號 ≠ 皎皎角帳號",
                    "Site account ≠ Jiaojiao account",
                    "サイトアカウント ≠ 皎皎角アカウント",
                    "사이트 계정 ≠ 쟈오쟈오 계정",
                    "Compte du site ≠ compte Jiaojiao"
                ),
                points: [
                    {
                        icon: "ri:chat-3-line",
                        text: L(
                            "站内社区账号（JWT）：邮箱登录；聊天、攻略发布、积分。",
                            "站內社群帳號（JWT）：電子郵件登入；聊天、攻略發布、積分。",
                            "Site account (JWT): email login; chat, guide publishing, points.",
                            "サイトアカウント（JWT）：メールでログイン。チャット、攻略投稿、ポイント。",
                            "사이트 계정(JWT): 이메일 로그인. 채팅, 공략 게시, 포인트.",
                            "Compte du site (JWT) : connexion e-mail ; chat, guides, points."
                        ),
                    },
                    {
                        icon: "ri:game-line",
                        text: L(
                            "皎皎角账号（DNA）：游戏账号；签到、角色与武器数据。",
                            "皎皎角帳號（DNA）：遊戲帳號；簽到、角色與武器資料。",
                            "Jiaojiao account (DNA): the game account; check-in, character and weapon data.",
                            "皎皎角アカウント（DNA）：ゲームアカウント。签到、キャラ・武器データ。",
                            "쟈오쟈오 계정(DNA): 게임 계정. 출석, 캐릭터/무기 데이터.",
                            "Compte Jiaojiao (DNA) : le compte de jeu ; check-in, données persos et armes."
                        ),
                    },
                    {
                        icon: "ri:lock-line",
                        text: L(
                            "两套账号彼此独立，入口也不同。",
                            "兩套帳號彼此獨立，入口也不同。",
                            "The two accounts are independent and have different entries.",
                            "2つのアカウントは独立しており、入口も異なります。",
                            "두 계정은 서로 독립적이며 입구도 다릅니다.",
                            "Les deux comptes sont indépendants, avec des entrées distinctes."
                        ),
                    },
                ],
                note: L(
                    "别把两套登录搞混",
                    "別把兩套登入搞混",
                    "Don't mix up the two logins",
                    "2つのログインを混同しない",
                    "두 로그인을 혼동하지 마세요",
                    "Ne mélangez pas les deux connexions"
                ),
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "站内社区账号用邮箱登录，管聊天、攻略和积分。",
                        "站內社群帳號用電子郵件登入，管聊天、攻略和積分。",
                        "The site account uses email and covers chat, guides, and points.",
                        "サイトアカウントはメールでログイン。チャット、攻略、ポイントを担当します。",
                        "사이트 계정은 이메일로 로그인하며 채팅, 공략, 포인트를 담당합니다.",
                        "Le compte du site utilise l'e-mail : chat, guides, points."
                    ),
                },
                {
                    at: 5.0,
                    text: L(
                        "皎皎角账号是游戏账号，管签到与游戏数据；两套账号彼此独立。",
                        "皎皎角帳號是遊戲帳號，管簽到與遊戲資料；兩套帳號彼此獨立。",
                        "The Jiaojiao account is the game account for check-in and game data; the two are independent.",
                        "皎皎角はゲームアカウント。签到とゲームデータを担当し、2つは独立しています。",
                        "쟈오쟈오 계정은 게임 계정으로 출석과 게임 데이터를 담당하며, 두 계정은 독립적입니다.",
                        "Le compte Jiaojiao gère check-in et données de jeu ; les deux sont indépendants."
                    ),
                },
            ],
        },
        {
            id: "chat",
            chapter: L("聊天", "聊天", "Chat", "チャット", "채팅", "Chat"),
            duration: 10,
            shot: {
                type: "community",
                mode: "chat",
                title: L(
                    "聊天室：有身份的社区",
                    "聊天室：有身分的社群",
                    "Chat: a community with identity",
                    "チャット：身分のあるコミュニティ",
                    "채팅: 정체성이 있는 커뮤니티",
                    "Chat : une communauté avec identité"
                ),
                messages: [
                    {
                        from: "them",
                        text: L(
                            "今晚深渊用哪套阵容？",
                            "今晚深淵用哪套陣容？",
                            "Which lineup for the abyss tonight?",
                            "今夜の深淵はどの編成？",
                            "오늘 밤 심연은 어떤 편성?",
                            "Quelle compo pour les abysses ce soir ?"
                        ),
                        author: L("旅人A", "旅人A", "Traveler A", "旅人A", "여행자A", "Voyageur A"),
                        tag: L("Lv.32", "Lv.32", "Lv.32", "Lv.32", "Lv.32", "Lv.32"),
                    },
                    {
                        from: "me",
                        text: L(
                            "试试赛琪风伤队，我刚发了构筑链接。",
                            "試試賽琪風傷隊，我剛發了構築連結。",
                            "Try the Saiqi wind team; I just posted the build link.",
                            "サイキ風パーティを試して。構築リンクを貼りました。",
                            "사이치 바람 팀을 써 보세요. 방금 빌드 링크를 올렸어요.",
                            "Essayez l'équipe Vent de Saiqi ; j'ai posté le lien du build."
                        ),
                        author: L("我", "我", "Me", "自分", "나", "Moi"),
                        tag: L("Lv.18", "Lv.18", "Lv.18", "Lv.18", "Lv.18", "Lv.18"),
                    },
                    {
                        from: "them",
                        text: L(
                            "收到，链接发我。",
                            "收到，連結發我。",
                            "Got it, send me the link.",
                            "了解、リンクを送って。",
                            "알겠어, 링크 보내 줘.",
                            "Reçu, envoie le lien."
                        ),
                        author: L("旅人A", "旅人A", "Traveler A", "旅人A", "여행자A", "Voyageur A"),
                    },
                ],
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "聊天 /chat 需要站内账号；房间列表显示未读与最后消息。",
                        "聊天 /chat 需要站內帳號；房間列表顯示未讀與最後訊息。",
                        "Chat at /chat needs the site account; the room list shows unread counts and last messages.",
                        "チャット /chat はサイトアカウントが必要。未読と最新メッセージが一覧に出ます。",
                        "채팅 /chat은 사이트 계정이 필요하며, 방 목록에 읽지 않음과 마지막 메시지가 표시됩니다.",
                        "Le chat /chat exige le compte du site ; la liste montre non-lus et derniers messages."
                    ),
                },
                {
                    at: 5.4,
                    text: L(
                        "消息支持图片、表情、回复、反应与撤回；回复和撤回在右键菜单。",
                        "訊息支援圖片、表情、回覆、反應與撤回；回覆和撤回在右鍵選單。",
                        "Messages support images, emoji, replies, reactions, and recall; reply and recall are in the right-click menu.",
                        "画像・絵文字・返信・リアクション・撤回に対応。返信と撤回は右クリックメニュー。",
                        "메시지는 이미지, 이모지, 답장, 반응, 회수를 지원하며 답장/회수는 우클릭 메뉴에 있습니다.",
                        "Messages : images, emoji, réponses, réactions, retrait ; réponse et retrait au clic droit."
                    ),
                },
            ],
            callouts: [
                {
                    at: 3.6,
                    text: L(
                        "右键：回复 / 撤回",
                        "右鍵：回覆 / 撤回",
                        "Right-click: reply / recall",
                        "右クリック：返信 / 撤回",
                        "우클릭: 답장 / 회수",
                        "Clic droit : répondre / retirer"
                    ),
                    x: 64,
                    y: 58,
                },
            ],
            note: L("需社区登录", "需社群登入", "Community login", "コミュニティログイン", "커뮤니티 로그인", "Connexion communauté"),
        },
        {
            id: "guides",
            chapter: L("论坛与攻略", "論壇與攻略", "Forum & guides", "フォーラムと攻略", "포럼과 공략", "Forum et guides"),
            duration: 9,
            shot: {
                type: "community",
                mode: "guides",
                title: L("论坛与攻略", "論壇與攻略", "Forum & guides", "フォーラムと攻略", "포럼과 공략", "Forum et guides"),
                nav: [
                    { label: L("全部", "全部", "All", "すべて", "전체", "Tous"), active: true },
                    { label: L("图文攻略", "圖文攻略", "Text guides", "記事攻略", "글 공략", "Guides texte") },
                    { label: L("一图流", "一圖流", "One-image", "一図流", "한장 공략", "Image unique") },
                ],
                posts: [
                    {
                        title: L(
                            "赛琪风伤队：从构筑到深渊",
                            "賽琪風傷隊：從構築到深淵",
                            "Saiqi wind team: from build to abyss",
                            "サイキ風編成：構築から深淵まで",
                            "사이치 바람 팀: 빌드에서 심연까지",
                            "Équipe Vent de Saiqi : du build aux abysses"
                        ),
                        author: L("旅人A", "旅人A", "Traveler A", "旅人A", "여행자A", "Voyageur A"),
                        meta: L(
                            "图文攻略 · 最近更新",
                            "圖文攻略 · 最近更新",
                            "Text guide · recently updated",
                            "記事攻略 · 最近更新",
                            "글 공략 · 최근 업데이트",
                            "Guide texte · récent"
                        ),
                        tag: L("角色", "角色", "Character", "キャラ", "캐릭터", "Personnage"),
                    },
                    {
                        title: L(
                            "一图流：本期深渊阵容",
                            "一圖流：本期深淵陣容",
                            "One image: this abyss lineup",
                            "一図流：今期の深淵編成",
                            "한장 공략: 이번 심연 편성",
                            "Image unique : compo des abysses"
                        ),
                        author: L("旅人B", "旅人B", "Traveler B", "旅人B", "여행자B", "Voyageur B"),
                        meta: L(
                            "一图流 · 最近更新",
                            "一圖流 · 最近更新",
                            "One-image · recently updated",
                            "一図流 · 最近更新",
                            "한장 공략 · 최근 업데이트",
                            "Image unique · récent"
                        ),
                        tag: L("深渊", "深淵", "Abyss", "深淵", "심연", "Abysses"),
                    },
                    {
                        title: L(
                            "萌新向：魔之楔怎么配",
                            "新手向：魔之楔怎麼配",
                            "Beginner: how to socket mods",
                            "初心者向け：魔之楔の組み方",
                            "초보자용: 모드 배치법",
                            "Débutant : installer les mods"
                        ),
                        author: L("旅人C", "旅人C", "Traveler C", "旅人C", "여행자C", "Voyageur C"),
                        meta: L(
                            "图文攻略 · 最近更新",
                            "圖文攻略 · 最近更新",
                            "Text guide · recently updated",
                            "記事攻略 · 最近更新",
                            "글 공략 · 최근 업데이트",
                            "Guide texte · récent"
                        ),
                        tag: L("入门", "入門", "Beginner", "入門", "입문", "Débutant"),
                    },
                    {
                        title: L(
                            "武器收益怎么排",
                            "武器收益怎麼排",
                            "Ranking weapon gains",
                            "武器の効果をどう並べる",
                            "무기 효율 순위",
                            "Classer les gains d'arme"
                        ),
                        author: L("旅人D", "旅人D", "Traveler D", "旅人D", "여행자D", "Voyageur D"),
                        meta: L(
                            "图文攻略 · 最近更新",
                            "圖文攻略 · 最近更新",
                            "Text guide · recently updated",
                            "記事攻略 · 最近更新",
                            "글 공략 · 최근 업데이트",
                            "Guide texte · récent"
                        ),
                        tag: L("武器", "武器", "Weapon", "武器", "무기", "Arme"),
                    },
                ],
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "攻略 /guides 与榜单 /ranking 公开可看。",
                        "攻略 /guides 與榜單 /ranking 公開可看。",
                        "Guides at /guides and ranking at /ranking are public.",
                        "攻略 /guides とランキング /ranking は公開です。",
                        "공략 /guides와 순위 /ranking은 공개입니다.",
                        "Guides /guides et classement /ranking sont publics."
                    ),
                },
                {
                    at: 5.2,
                    text: L(
                        "论坛要皎皎角账号；发布攻略要站内账号登录。",
                        "論壇要皎皎角帳號；發布攻略要站內帳號登入。",
                        "The forum needs Jiaojiao; publishing guides needs the site account.",
                        "フォーラムは皎皎角、攻略投稿はサイトアカウントが必要です。",
                        "포럼은 쟈오쟈오, 공략 게시는 사이트 계정이 필요합니다.",
                        "Forum : Jiaojiao ; publier un guide : compte du site."
                    ),
                },
            ],
            note: L(
                "发布需社区登录",
                "發布需社群登入",
                "Login to publish",
                "投稿にはログインが必要",
                "게시하려면 로그인",
                "Connexion pour publier"
            ),
        },
        {
            id: "abyss-usage",
            chapter: L("深渊使用率", "深淵使用率", "Abyss usage", "深淵使用率", "심연 사용률", "Usage des abysses"),
            duration: 10.5,
            shot: {
                type: "dashboard",
                kicker: "ABYSS USAGE",
                title: L(
                    "深渊使用率：看，也能传",
                    "深淵使用率：看，也能傳",
                    "Abyss usage: read it, upload it",
                    "深淵使用率：見るだけでなく投稿も",
                    "심연 사용률: 보고, 올리기",
                    "Usage des abysses : consulter et envoyer"
                ),
                stats: [
                    { label: L("统计范围", "統計範圍", "Scope", "集計範囲", "집계 범위", "Périmètre"), value: "Season", accent: true },
                    { label: L("上传门槛", "上傳門檻", "Upload threshold", "投稿条件", "업로드 조건", "Seuil"), value: "160", unit: "★" },
                    { label: L("上传奖励", "上傳獎勵", "Upload reward", "投稿報酬", "업로드 보상", "Récompense"), value: "EXP + PTS" },
                    { label: L("数据来源", "資料來源", "Data source", "データ元", "데이터 출처", "Source"), value: "Jiaojiao" },
                ],
                rows: [
                    {
                        label: L("浏览统计", "瀏覽統計", "Browse stats", "閲覧統計", "조회 통계", "Statistiques"),
                        value: "Public",
                        meta: L(
                            "/abyss-usage · 公开页面",
                            "/abyss-usage · 公開頁面",
                            "/abyss-usage · public page",
                            "/abyss-usage · 公開ページ",
                            "/abyss-usage · 공개 페이지",
                            "/abyss-usage · page publique"
                        ),
                    },
                    {
                        label: L("上传数据", "上傳資料", "Upload data", "アップロード", "업로드", "Envoi"),
                        value: "Login",
                        meta: L(
                            "社区账号 + 皎皎角",
                            "社群帳號 + 皎皎角",
                            "site + Jiaojiao",
                            "サイト + 皎皎角",
                            "사이트 + 쟈오쟈오",
                            "site + Jiaojiao"
                        ),
                    },
                    {
                        label: L("当前赛季", "當前賽季", "Season", "現在シーズン", "현재 시즌", "Saison"),
                        value: "Auto",
                        meta: L("深渊赛季", "深淵賽季", "Abyss season", "深淵シーズン", "심연 시즌", "Saison des abysses"),
                    },
                    {
                        label: L("灾厄武器", "災厄武器", "Calamity weapon", "災厄武器", "재앙 무기", "Arme calamité"),
                        value: "Manual",
                        meta: L(
                            "图标缺失时弹出选择",
                            "圖示缺失時彈出選擇",
                            "picker opens when icons are missing",
                            "アイコン欠落時に選択",
                            "아이콘 누락 시 선택",
                            "choix si icône absente"
                        ),
                    },
                ],
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "深渊使用率公开可查，统计按当前赛季展示。",
                        "深淵使用率公開可查，統計按當前賽季展示。",
                        "Abyss usage is public; stats are shown for the current season.",
                        "深淵使用率は公開。統計は現在シーズンで表示されます。",
                        "심연 사용률은 공개이며, 통계는 현재 시즌 기준으로 표시됩니다.",
                        "L'usage des abysses est public ; les stats suivent la saison en cours."
                    ),
                },
                {
                    at: 5.4,
                    text: L(
                        "上传需要登录，星数至少 160；灾厄武器要手动指定。",
                        "上傳需要登入，星數至少 160；災厄武器要手動指定。",
                        "Uploading needs login and at least 160 stars; calamity weapons are picked manually.",
                        "投稿にはログインと星160以上が必要。災厄武器は手動指定です。",
                        "업로드에는 로그인과 별 160 이상이 필요하며, 재앙 무기는 수동 지정합니다.",
                        "Envoi : connexion et 160 étoiles minimum ; armes calamité choisies à la main."
                    ),
                },
            ],
            callouts: [
                {
                    at: 3.4,
                    text: L(
                        "当前赛季自动判定",
                        "當前賽季自動判定",
                        "Season auto-detected",
                        "現在シーズンは自動判定",
                        "현재 시즌 자동 판정",
                        "Saison automatique"
                    ),
                    x: 52,
                    y: 40,
                },
            ],
            note: L(
                "上传需社区登录 + 皎皎角账号",
                "上傳需社群登入 + 皎皎角帳號",
                "Upload needs both logins",
                "投稿には両方のログインが必要",
                "업로드에 두 로그인 필요",
                "Envoi : deux connexions requises"
            ),
        },
        {
            id: "recap",
            chapter: L("回顾", "回顧", "Recap", "まとめ", "정리", "Récapitulatif"),
            duration: 9,
            shot: {
                type: "recap",
                title: L(
                    "逛社区，先认账号",
                    "逛社群，先認帳號",
                    "Know your accounts first",
                    "まずアカウントを区別",
                    "계정부터 구분하기",
                    "D'abord, les comptes"
                ),
                checklist: [
                    L(
                        "站内账号：聊天、攻略发布、上传",
                        "站內帳號：聊天、攻略發布、上傳",
                        "Site account: chat, guide publishing, uploads",
                        "サイト：チャット・攻略投稿・アップロード",
                        "사이트: 채팅, 공략 게시, 업로드",
                        "Site : chat, guides, envois"
                    ),
                    L(
                        "皎皎角账号：签到、游戏数据",
                        "皎皎角帳號：簽到、遊戲資料",
                        "Jiaojiao: check-in, game data",
                        "皎皎角：签到・ゲームデータ",
                        "쟈오쟈오: 출석, 게임 데이터",
                        "Jiaojiao : check-in, données"
                    ),
                    L(
                        "攻略、榜单、深渊使用率公开可看",
                        "攻略、榜單、深淵使用率公開可看",
                        "Guides, ranking, abyss usage are public",
                        "攻略・ランキング・深淵使用率は公開",
                        "공략, 순위, 심연 사용률은 공개",
                        "Guides, classement et abysses publics"
                    ),
                ],
                route: "/dna",
                routeLabel: L("打开皎皎角", "開啟皎皎角", "Open Jiaojiao", "皎皎角を開く", "쟈오쟈오 열기", "Ouvrir Jiaojiao"),
                hint: L(
                    "积分商城在设置，计数器与万华在 More。",
                    "積分商城在設定，計數器與萬華在 More。",
                    "The points shop is in Settings; counters and Wanhua are in More.",
                    "ポイントショップは設定、カウンターと万華は More。",
                    "포인트 상점은 설정, 카운터와 완화는 More.",
                    "Boutique dans Réglages ; compteurs et Wanhua dans More."
                ),
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "记住：聊天用站内账号，签到用皎皎角账号。",
                        "記住：聊天用站內帳號，簽到用皎皎角帳號。",
                        "Remember: chat uses the site account, check-in uses Jiaojiao.",
                        "覚えて：チャットはサイト、签到は皎皎角アカウント。",
                        "기억하세요: 채팅은 사이트 계정, 출석은 쟈오쟈오 계정.",
                        "Retenez : chat = compte du site, check-in = Jiaojiao."
                    ),
                },
            ],
        },
    ],
}
