import { L, type Tutorial } from "../types"

export const skinColorizeTutorial: Tutorial = {
    id: "skin-colorize",
    number: "08",
    category: "data",
    title: L("皮肤染色", "皮膚染色", "Skin Dyeing", "スキン染色", "스킨 염색", "Teinture de peau"),
    subtitle: L(
        "九块皮肤、六个发型部位，配出一套能分享的颜色。",
        "九塊皮膚、六個髮型部位，配出一套能分享的顏色。",
        "Nine skin zones, six optional hair zones, one shareable palette.",
        "皮膚9部位と髪型6部位で、共有できる配色を作る。",
        "피부 9부위와 헤어 6부위로 공유 가능한 배색을 만듭니다.",
        "Neuf zones de peau, six zones de cheveux, une palette à partager."
    ),
    summary: L(
        "从方案广场挑一套，分清九个皮肤部位与可选发型部位；看懂资源色板、特殊部位与染色码，再用相似色与发布流程收尾。",
        "從方案廣場挑一套，分清九個皮膚部位與可選髮型部位；看懂資源色板、特殊部位與染色碼，再用相似色與發佈流程收尾。",
        "Browse the gallery, separate the nine skin zones from the optional hair zones, read resource-grouped swatches and special zones, then finish with dye codes, similar colors, and publishing.",
        "ギャラリーで染色プランを選び、皮膚9部位と任意の髪型部位を区別。資源別のスウォッチ、特殊部位、染色コード、類似色、公開までを解説します。",
        "갤러리에서 배색안을 고르고 피부 9부위와 선택형 헤어 부위를 구분합니다. 자원별 색상 팔레트, 특수 부위, 염색 코드, 유사색, 게시까지 다룹니다.",
        "Parcourez la galerie, distinguez les neuf zones de peau des zones de cheveux optionnelles, lisez les palettes par ressource et les zones spéciales, puis terminez par les codes, les couleurs proches et la publication."
    ),
    icon: "ri:palette-line",
    accent: "#12c2e9",
    route: "/skin-colorize",
    routeLabel: L("打开染色广场", "開啟染色廣場", "Open dye gallery", "染色ギャラリーを開く", "염색 갤러리 열기", "Ouvrir la galerie"),
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
                    "EP 08 · 数据工具",
                    "EP 08 · 資料與工具",
                    "EP 08 · DATA & TOOLS",
                    "EP 08 · データとツール",
                    "EP 08 · 데이터와 도구",
                    "EP 08 · DONNÉES ET OUTILS"
                ),
                title: L("皮肤染色", "皮膚染色", "Skin Dyeing", "スキン染色", "스킨 염색", "Teinture de peau"),
                subtitle: L(
                    "从广场挑一套，再把它改成自己的。",
                    "從廣場挑一套，再把它改成自己的。",
                    "Pick a scheme from the gallery, then make it yours.",
                    "ギャラリーで選んで、自分好みに変える。",
                    "갤러리에서 골라 내 색으로 바꿉니다.",
                    "Choisissez un schéma, puis personnalisez-le."
                ),
                icon: "ri:palette-line",
                index: "08",
            },
            captions: [
                {
                    at: 0.9,
                    text: L(
                        "从方案广场挑一套，再进编辑器改成自己的。",
                        "從方案廣場挑一套，再進編輯器改成自己的。",
                        "Pick a scheme from the gallery, then make it yours in the editor.",
                        "ギャラリーで染色プランを選び、エディターで自分好みに変えます。",
                        "갤러리에서 배색안을 고르고 편집기에서 내 색으로 바꿉니다.",
                        "Choisissez un schéma dans la galerie, puis personnalisez-le dans l'éditeur."
                    ),
                },
            ],
        },
        {
            id: "gallery",
            chapter: L("方案广场", "方案廣場", "Gallery", "ギャラリー", "갤러리", "Galerie"),
            duration: 10.5,
            shot: {
                type: "cards",
                kicker: "DYE GALLERY",
                title: L(
                    "方案广场，先逛再改",
                    "方案廣場，先逛再改",
                    "Gallery first, edit later",
                    "まずギャラリーを見る",
                    "먼저 갤러리에서 둘러보기",
                    "D'abord la galerie, ensuite l'édition"
                ),
                variant: "gallery",
                toolbar: {
                    tabs: [
                        L("按角色", "按角色", "By character", "キャラ別", "캐릭터별", "Par personnage"),
                        L("按皮肤系列", "按皮膚系列", "By skin series", "スキンシリーズ別", "스킨 시리즈별", "Par série de skins"),
                    ],
                    activeTab: 0,
                    actions: [
                        L("最新", "最新", "Newest", "新着", "최신", "Récents"),
                        L("最热", "最熱", "Hottest", "人気", "인기", "Populaires"),
                        L("最多浏览", "最多瀏覽", "Most viewed", "最多閲覧", "최다 조회", "Les plus vus"),
                    ],
                },
                items: [
                    {
                        title: L(
                            "赛琪 · 霜蓝",
                            "賽琪 · 霜藍",
                            "Saiqi · Frost Blue",
                            "サイキ・フロストブルー",
                            "사이치 · 서리 블루",
                            "Saiqi · Bleu givré"
                        ),
                        subtitle: L(
                            "9 部位 · 含发型",
                            "9 部位 · 含髮型",
                            "9 zones · hair",
                            "9部位・髪型あり",
                            "9부위 · 헤어 포함",
                            "9 zones · cheveux"
                        ),
                        tag: L("原创", "原創", "Original", "オリジナル", "창작", "Original"),
                        meta: L(
                            "浏览 1.2k · 赞 328 · 评 24",
                            "瀏覽 1.2k · 讚 328 · 評 24",
                            "1.2k views · 328 likes · 24 comments",
                            "閲覧1.2k・いいね328・コメ24",
                            "조회 1.2k · 좋아요 328 · 댓글 24",
                            "1,2k vues · 328 j'aime · 24 comm."
                        ),
                        accent: "#60a5fa",
                    },
                    {
                        title: L("黎瑟 · 熔金", "黎瑟 · 熔金", "Lise · Molten Gold", "リーゼ・溶金", "리제 · 용해 금", "Lise · Or fondu"),
                        subtitle: L(
                            "9 部位 · 转载",
                            "9 部位 · 轉載",
                            "9 zones · repost",
                            "9部位・転載",
                            "9부위 · 재게시",
                            "9 zones · repartagé"
                        ),
                        tag: L("转载", "轉載", "Repost", "転載", "재게시", "Repartagé"),
                        meta: L(
                            "浏览 2.1k · 赞 210 · 评 18",
                            "瀏覽 2.1k · 讚 210 · 評 18",
                            "2.1k views · 210 likes · 18 comments",
                            "閲覧2.1k・いいね210・コメ18",
                            "조회 2.1k · 좋아요 210 · 댓글 18",
                            "2,1k vues · 210 j'aime · 18 comm."
                        ),
                        accent: "#fbbf24",
                    },
                    {
                        title: L(
                            "贝蕾妮卡 · 苔原",
                            "貝蕾妮卡 · 苔原",
                            "Berenica · Tundra",
                            "ベレニカ・ツンドラ",
                            "베레니카 · 툰드라",
                            "Berenica · Toundra"
                        ),
                        subtitle: L(
                            "9 部位 · 含发型",
                            "9 部位 · 含髮型",
                            "9 zones · hair",
                            "9部位・髪型あり",
                            "9부위 · 헤어 포함",
                            "9 zones · cheveux"
                        ),
                        tag: L("原创", "原創", "Original", "オリジナル", "창작", "Original"),
                        meta: L(
                            "浏览 980 · 赞 164 · 评 12",
                            "瀏覽 980 · 讚 164 · 評 12",
                            "980 views · 164 likes · 12 comments",
                            "閲覧980・いいね164・コメ12",
                            "조회 980 · 좋아요 164 · 댓글 12",
                            "980 vues · 164 j'aime · 12 comm."
                        ),
                        accent: "#22c55e",
                    },
                    {
                        title: L("达芙涅 · 潮汐", "達芙涅 · 潮汐", "Daphne · Tide", "ダフネ・潮汐", "다프네 · 조수", "Daphné · Marée"),
                        subtitle: L(
                            "9 部位 · 含发型",
                            "9 部位 · 含髮型",
                            "9 zones · hair",
                            "9部位・髪型あり",
                            "9부위 · 헤어 포함",
                            "9 zones · cheveux"
                        ),
                        tag: L("原创", "原創", "Original", "オリジナル", "창작", "Original"),
                        meta: L(
                            "浏览 1.6k · 赞 402 · 评 31",
                            "瀏覽 1.6k · 讚 402 · 評 31",
                            "1.6k views · 402 likes · 31 comments",
                            "閲覧1.6k・いいね402・コメ31",
                            "조회 1.6k · 좋아요 402 · 댓글 31",
                            "1,6k vues · 402 j'aime · 31 comm."
                        ),
                        accent: "#38bdf8",
                    },
                    {
                        title: L(
                            "芙罗拉 · 夜莓",
                            "芙羅拉 · 夜莓",
                            "Flora · Nightberry",
                            "フローラ・ナイトベリー",
                            "플로라 · 밤딸기",
                            "Flora · Baie de nuit"
                        ),
                        subtitle: L(
                            "9 部位 · 转载",
                            "9 部位 · 轉載",
                            "9 zones · repost",
                            "9部位・転載",
                            "9부위 · 재게시",
                            "9 zones · repartagé"
                        ),
                        tag: L("转载", "轉載", "Repost", "転載", "재게시", "Repartagé"),
                        meta: L(
                            "浏览 760 · 赞 98 · 评 9",
                            "瀏覽 760 · 讚 98 · 評 9",
                            "760 views · 98 likes · 9 comments",
                            "閲覧760・いいね98・コメ9",
                            "조회 760 · 좋아요 98 · 댓글 9",
                            "760 vues · 98 j'aime · 9 comm."
                        ),
                        accent: "#a78bfa",
                    },
                    {
                        title: L("卡嘉 · 余烬", "卡嘉 · 餘燼", "Kaja · Embers", "カジャ・残り火", "카자 · 잔불", "Kaja · Braises"),
                        subtitle: L(
                            "9 部位 · 含发型",
                            "9 部位 · 含髮型",
                            "9 zones · hair",
                            "9部位・髪型あり",
                            "9부위 · 헤어 포함",
                            "9 zones · cheveux"
                        ),
                        tag: L("原创", "原創", "Original", "オリジナル", "창작", "Original"),
                        meta: L(
                            "浏览 2.4k · 赞 531 · 评 42",
                            "瀏覽 2.4k · 讚 531 · 評 42",
                            "2.4k views · 531 likes · 42 comments",
                            "閲覧2.4k・いいね531・コメ42",
                            "조회 2.4k · 좋아요 531 · 댓글 42",
                            "2,4k vues · 531 j'aime · 42 comm."
                        ),
                        accent: "#fb7185",
                    },
                ],
                columns: 3,
                highlight: 0,
                highlightAt: 2.4,
                highlightLabel: L("打开方案", "開啟方案", "Open scheme", "染色プランを開く", "배색안 열기", "Ouvrir"),
                footnote: L(
                    "每页 24 条 · 最新 / 最热 / 最多浏览",
                    "每頁 24 條 · 最新 / 最熱 / 最多瀏覽",
                    "24 per page · newest / hottest / most viewed",
                    "1ページ24件・新着 / 人気 / 最多閲覧",
                    "페이지당 24개 · 최신 / 인기 / 최다 조회",
                    "24 par page · récents / populaires / plus vus"
                ),
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "广场可按角色和皮肤系列筛选，每页 24 条。",
                        "廣場可按角色和皮膚系列篩選，每頁 24 條。",
                        "Filter by character or skin series. Twenty-four schemes per page.",
                        "キャラやスキンシリーズで絞り込み。1ページ24件です。",
                        "캐릭터와 스킨 시리즈로 필터링하며 페이지당 24개입니다.",
                        "Filtrez par personnage ou série de skins, 24 schémas par page."
                    ),
                },
                {
                    at: 5.2,
                    text: L(
                        "卡片标出原创或转载、是否含发型，以及赞评浏览。",
                        "卡片標出原創或轉載、是否含髮型，以及讚評瀏覽。",
                        "Cards mark original or repost, hair support, likes, comments, and views.",
                        "カードにはオリジナル／転載、髪型の有無、いいね・コメント・閲覧数。",
                        "카드에 창작/재게시, 헤어 포함 여부, 좋아요·댓글·조회수가 표시됩니다.",
                        "Les cartes indiquent original ou repartage, cheveux, j'aime, commentaires et vues."
                    ),
                },
            ],
            callouts: [
                {
                    at: 2.4,
                    text: L(
                        "按角色 / 皮肤系列",
                        "按角色 / 皮膚系列",
                        "By character / series",
                        "キャラ / シリーズ別",
                        "캐릭터 / 시리즈별",
                        "Par personnage / série"
                    ),
                    x: 24,
                    y: 22,
                },
                {
                    at: 6.6,
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
            id: "parts",
            chapter: L("编辑器", "編輯器", "Editor", "エディター", "편집기", "Éditeur"),
            duration: 11,
            shot: {
                type: "palette",
                character: L(
                    "赛琪 · 霜蓝",
                    "賽琪 · 霜藍",
                    "Saiqi · Frost Blue",
                    "サイキ・フロストブルー",
                    "사이치 · 서리 블루",
                    "Saiqi · Bleu givré"
                ),
                parts: [
                    { label: L("部位 1", "部位 1", "Part 1", "部位 1", "부위 1", "Zone 1"), color: "#dbeafe" },
                    { label: L("部位 2", "部位 2", "Part 2", "部位 2", "부위 2", "Zone 2"), color: "#f8fafc" },
                    { label: L("部位 3", "部位 3", "Part 3", "部位 3", "부위 3", "Zone 3"), color: "#60a5fa" },
                    { label: L("部位 4", "部位 4", "Part 4", "部位 4", "부위 4", "Zone 4"), color: "#3b82f6" },
                    { label: L("部位 5", "部位 5", "Part 5", "部位 5", "부위 5", "Zone 5"), color: "#1d4ed8" },
                    { label: L("部位 6", "部位 6", "Part 6", "部位 6", "부위 6", "Zone 6"), color: "#0ea5e9" },
                    { label: L("部位 7", "部位 7", "Part 7", "部位 7", "부위 7", "Zone 7"), color: "#93c5fd" },
                    { label: L("部位 8", "部位 8", "Part 8", "部位 8", "부위 8", "Zone 8"), color: "#0f172a" },
                    { label: L("部位 9", "部位 9", "Part 9", "部位 9", "부위 9", "Zone 9"), color: "#e2e8f0" },
                ],
                swatches: [
                    { color: "#f8fafc" },
                    { color: "#e2e8f0" },
                    { color: "#cbd5e1" },
                    { color: "#94a3b8" },
                    { color: "#64748b" },
                    { color: "#334155" },
                    { color: "#0f172a" },
                    { color: "#1e3a8a" },
                    { color: "#1d4ed8" },
                    { color: "#2563eb" },
                    { color: "#3b82f6" },
                    { color: "#60a5fa" },
                    { color: "#93c5fd", active: true },
                    { color: "#bfdbfe" },
                    { color: "#dbeafe" },
                    { color: "#eff6ff" },
                    { color: "#0ea5e9" },
                    { color: "#38bdf8" },
                    { color: "#7dd3fc" },
                    { color: "#bae6fd" },
                    { color: "#14532d" },
                    { color: "#166534" },
                    { color: "#22c55e" },
                    { color: "#86efac" },
                    { color: "#f59e0b" },
                    { color: "#fbbf24" },
                    { color: "#fde68a" },
                    { color: "#78350f" },
                    { color: "#92400e" },
                    { color: "#b45309" },
                    { color: "#d97706" },
                    { color: "#f97316" },
                    { color: "#fdba74" },
                    { color: "#4c1d95" },
                    { color: "#6d28d9" },
                    { color: "#8b5cf6" },
                    { color: "#c4b5fd" },
                ],
                code: "C2F8A1K9M4Q735K9",
                codeAt: 5,
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "九个皮肤部位，点哪个部位，右边就换哪个的颜色。",
                        "九個皮膚部位，點哪個部位，右邊就換哪個的顏色。",
                        "Nine skin zones. Select one, then pick its color on the right.",
                        "皮膚は9部位。部位を選ぶと右側で色を変えられます。",
                        "피부 9부위 중 하나를 고르고 오른쪽에서 색을 바꿉니다.",
                        "Neuf zones de peau. Sélectionnez-en une, puis choisissez sa couleur."
                    ),
                },
                {
                    at: 5.6,
                    text: L(
                        "可选六个发型部位；色板按染色资源分组，选前先看消耗。",
                        "可選六個髮型部位；色板按染色資源分組，選前先看消耗。",
                        "Six optional hair zones. Swatches are grouped by dye resource, so check the cost.",
                        "髪型は任意の6部位。スウォッチは染色資源ごとにまとまり、消費も確認できます。",
                        "헤어는 선택형 6부위입니다. 색상은 염색 자원별로 묶여 있어 소모를 확인할 수 있습니다.",
                        "Six zones de cheveux optionnelles. Les nuances sont groupées par ressource de teinture."
                    ),
                },
            ],
            callouts: [
                {
                    at: 2.8,
                    text: L("9 个皮肤部位", "9 個皮膚部位", "9 skin zones", "皮膚9部位", "피부 9부위", "9 zones de peau"),
                    x: 20,
                    y: 30,
                },
                {
                    at: 7.8,
                    text: L(
                        "色板按染色资源分组",
                        "色板按染色資源分組",
                        "Grouped by dye resource",
                        "染色資源ごとのスウォッチ",
                        "염색 자원별 색상",
                        "Groupées par ressource"
                    ),
                    x: 56,
                    y: 42,
                },
            ],
        },
        {
            id: "special-rules",
            chapter: L("特殊规则", "特殊規則", "Special rules", "特殊ルール", "특수 규칙", "Règles spéciales"),
            duration: 8,
            shot: {
                type: "callout",
                kicker: "PART 8 & DEFAULT",
                title: L(
                    "两条规则，先记牢",
                    "兩條規則，先記牢",
                    "Two rules to remember",
                    "先に覚える2つのルール",
                    "먼저 알아둘 두 규칙",
                    "Deux règles à retenir"
                ),
                icon: "ri:error-warning-line",
                points: [
                    {
                        text: L(
                            "部位 8 只接受特殊色板 1022–1027，不是色板缺失。",
                            "部位 8 只接受特殊色板 1022–1027，不是色板缺失。",
                            "Part 8 only accepts the special swatches 1022–1027; nothing is missing.",
                            "部位8は特殊スウォッチ1022–1027のみ。スウォッチ不足ではありません。",
                            "부위 8은 특수 색상 1022–1027만 허용합니다. 색상이 빠진 게 아닙니다.",
                            "La zone 8 n'accepte que les nuances spéciales 1022–1027 ; rien ne manque."
                        ),
                    },
                    {
                        text: L(
                            "默认色 id 为 -1，不消耗任何染色资源。",
                            "預設色 id 為 -1，不消耗任何染色資源。",
                            "Default color id -1 costs no dye resources.",
                            "初期色のIDは-1で、染色資源を消費しません。",
                            "기본색 id는 -1이며 염색 자원을 소모하지 않습니다.",
                            "La couleur par défaut, id -1, ne coûte aucune ressource."
                        ),
                    },
                ],
                note: L(
                    "规则来自当前数据版本",
                    "規則來自目前資料版本",
                    "Rules from the current data version",
                    "現在のデータ版に基づく",
                    "현재 데이터 버전 기준",
                    "Règles de la version actuelle"
                ),
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "部位 8 只能用 1022–1027 这六个特殊色板。",
                        "部位 8 只能用 1022–1027 這六個特殊色板。",
                        "Part 8 can only use the six special swatches 1022–1027.",
                        "部位8で使えるのは特殊スウォッチ1022–1027の6つだけです。",
                        "부위 8은 특수 색상 1022–1027 여섯 개만 사용할 수 있습니다.",
                        "La zone 8 n'utilise que les six nuances spéciales 1022–1027."
                    ),
                },
                {
                    at: 4.4,
                    text: L(
                        "默认色是 -1，不消耗资源；别把它算进成本。",
                        "預設色是 -1，不消耗資源；別把它算進成本。",
                        "Default color -1 costs nothing. Don't count it in your budget.",
                        "初期色-1は資源を消費しません。コストに含めないでください。",
                        "기본색 -1은 자원을 쓰지 않습니다. 비용에 넣지 마세요.",
                        "La couleur -1 ne coûte rien : ne la comptez pas dans le budget."
                    ),
                },
            ],
        },
        {
            id: "dye-code",
            chapter: L("染色码", "染色碼", "Dye code", "染色コード", "염색 코드", "Code de teinture"),
            duration: 10.5,
            shot: {
                type: "code",
                title: L(
                    "染色码：复制与粘贴导入",
                    "染色碼：複製與貼上匯入",
                    "Dye codes: copy and paste",
                    "染色コード：コピーと貼り付け",
                    "염색 코드: 복사와 붙여넣기",
                    "Codes : copier et coller"
                ),
                language: "BASE36",
                lines: ["C2F8A1K9M4Q735K9", "H2F8A1K9M4Q7", "", "C = skin  /  H = hair  /  W = weapon"],
                highlight: [0, 1],
                copyAt: 3.6,
                result: L(
                    "页面只接受角色皮肤码；C/H/W 区分类型，导入会校验长度、字符与色板。",
                    "頁面只接受角色皮膚碼；C/H/W 區分類型，匯入會校驗長度、字元與色板。",
                    "This page accepts character skin codes only; C/H/W marks the type, and import validates length, characters, and swatches.",
                    "このページはキャラ皮膚コードのみ。C/H/Wで種類を区別し、取り込み時に長さ・文字・スウォッチを検証します。",
                    "이 페이지는 캐릭터 피부 코드만 받습니다. C/H/W로 종류를 구분하며 가져올 때 길이·문자·색상을 검증합니다.",
                    "Cette page n'accepte que les codes peau de personnage ; C/H/W indique le type, et l'import vérifie longueur, caractères et nuances."
                ),
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "前缀 C/H/W 区分皮肤、发型、武器；后面是 Base36 的 id。",
                        "前綴 C/H/W 區分皮膚、髮型、武器；後面是 Base36 的 id。",
                        "The C/H/W prefix marks skin, hair, or weapon; Base36 IDs follow.",
                        "C/H/Wは皮膚・髪型・武器の区別。続いてBase36のIDです。",
                        "C/H/W 접두사는 피부·헤어·무기를 구분하며 뒤에 Base36 id가 옵니다.",
                        "Le préfixe C/H/W indique peau, cheveux ou arme ; puis des ID en Base36."
                    ),
                },
                {
                    at: 5.4,
                    text: L(
                        "复制即可分享；粘贴导入会校验，手改一位可能直接失败。",
                        "複製即可分享；貼上匯入會校驗，手改一位可能直接失敗。",
                        "Copy to share, paste to import. Validation is strict: one edited character can fail.",
                        "コピーで共有、貼り付けで取り込み。検証は厳しく、1文字の変更でも失敗します。",
                        "복사해 공유하고 붙여넣어 가져옵니다. 한 글자만 바꿔도 검증에서 실패할 수 있습니다.",
                        "Copiez pour partager, collez pour importer. Un seul caractère modifié peut échouer."
                    ),
                },
            ],
            callouts: [
                {
                    at: 2.4,
                    text: L(
                        "C 皮肤 / H 发型",
                        "C 皮膚 / H 髮型",
                        "C skin / H hair",
                        "C 皮膚 / H 髪型",
                        "C 피부 / H 헤어",
                        "C peau / H cheveux"
                    ),
                    x: 30,
                    y: 32,
                },
                {
                    at: 7.2,
                    text: L(
                        "校验不通过会拒绝",
                        "校驗不通過會拒絕",
                        "Invalid codes are rejected",
                        "検証失敗は拒否",
                        "검증 실패 시 거부",
                        "Tout code invalide est refusé"
                    ),
                    x: 58,
                    y: 68,
                },
            ],
            note: L("复制 / 粘贴导入", "複製 / 貼上匯入", "Copy / paste import", "コピー／貼り付け", "복사 / 붙여넣기", "Copier / coller"),
        },
        {
            id: "find-and-publish",
            chapter: L("找色与发布", "找色與發佈", "Find & publish", "色探しと公開", "색 찾기와 게시", "Trouver et publier"),
            duration: 9.5,
            shot: {
                type: "callout",
                kicker: "OKLAB & PUBLISH",
                title: L(
                    "找相似色，再发布作品",
                    "找相似色，再發佈作品",
                    "Match a color, then publish",
                    "類似色を探して公開",
                    "유사색을 찾고 게시하기",
                    "Trouver la couleur, puis publier"
                ),
                icon: "ri:magic-line",
                points: [
                    {
                        text: L(
                            "相似色按 OKLab ΔE 排序，阈值可在 2–60 之间调。",
                            "相似色按 OKLab ΔE 排序，閾值可在 2–60 之間調。",
                            "Similar colors are ranked by OKLab ΔE, with a threshold from 2 to 60.",
                            "類似色はOKLab ΔE順。しきい値は2〜60で調整できます。",
                            "유사색은 OKLab ΔE 순으로 정렬되며 임계값은 2–60에서 조절합니다.",
                            "Les couleurs proches sont classées par ΔE OKLab, seuil réglable de 2 à 60."
                        ),
                    },
                    {
                        text: L(
                            "预览图不超过 3MB；发布需登录，并选原创或转载。",
                            "預覽圖不超過 3MB；發佈需登入，並選原創或轉載。",
                            "Preview images must stay under 3MB. Publishing requires login and original/repost.",
                            "プレビュー画像は3MB以下。公開にはログインとオリジナル／転載の選択が必要です。",
                            "미리보기 이미지는 3MB 이하이며, 게시하려면 로그인과 창작/재게시 선택이 필요합니다.",
                            "L'aperçu doit faire moins de 3 Mo. Publier exige une connexion et le choix original/repartage."
                        ),
                    },
                    {
                        text: L(
                            "转载要填来源；只有作者或管理员能继续编辑。",
                            "轉載要填來源；只有作者或管理員能繼續編輯。",
                            "Reposts need a source. Only the author or an admin can keep editing.",
                            "転載は出典必須。編集できるのは作者か管理者だけです。",
                            "재게시는 출처를 적어야 하며, 작성자나 관리자만 계속 편집할 수 있습니다.",
                            "Un repartage exige une source. Seuls l'auteur ou un admin peuvent modifier."
                        ),
                    },
                ],
                note: L("发布需登录", "發佈需登入", "Login to publish", "公開にはログイン", "게시하려면 로그인", "Connexion requise"),
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "相似色用 OKLab ΔE，阈值可在 2 到 60 之间调。",
                        "相似色用 OKLab ΔE，閾值可在 2 到 60 之間調。",
                        "Similar colors use OKLab ΔE, with a threshold from 2 to 60.",
                        "類似色はOKLab ΔE。しきい値は2〜60で調整します。",
                        "유사색은 OKLab ΔE를 사용하며 임계값은 2–60입니다.",
                        "Les couleurs proches utilisent ΔE OKLab, seuil de 2 à 60."
                    ),
                },
                {
                    at: 5.2,
                    text: L(
                        "发布需登录；原创或转载都要交代清楚，预览图不超过 3MB。",
                        "發佈需登入；原創或轉載都要交代清楚，預覽圖不超過 3MB。",
                        "Publishing needs login. State original or repost, and keep previews under 3MB.",
                        "公開にはログインが必要。オリジナル／転載を明記し、画像は3MB以下に。",
                        "게시하려면 로그인하고 창작/재게시를 밝혀야 하며 미리보기는 3MB 이하입니다.",
                        "Publier exige une connexion, le choix original/repartage et un aperçu sous 3 Mo."
                    ),
                },
            ],
        },
        {
            id: "recap",
            chapter: L("回顾", "回顧", "Recap", "まとめ", "정리", "Récapitulatif"),
            duration: 9,
            shot: {
                type: "recap",
                title: L(
                    "把一套配色变成一张名片",
                    "把一套配色變成一張名片",
                    "Turn a palette into a calling card",
                    "配色を一枚の名刺に",
                    "배색을 명함 한 장으로",
                    "Faites de la palette une carte de visite"
                ),
                checklist: [
                    L(
                        "广场按角色 / 系列筛选，每页 24 条",
                        "廣場按角色 / 系列篩選，每頁 24 條",
                        "Filter the gallery by character or series, 24 per page",
                        "ギャラリーはキャラ／シリーズ別、1ページ24件",
                        "갤러리는 캐릭터/시리즈별, 페이지당 24개",
                        "Galerie par personnage ou série, 24 par page"
                    ),
                    L(
                        "9 个皮肤部位 + 可选 6 个发型部位",
                        "9 個皮膚部位 + 可選 6 個髮型部位",
                        "9 skin zones + 6 optional hair zones",
                        "皮膚9部位＋任意の髪型6部位",
                        "피부 9부위 + 선택형 헤어 6부위",
                        "9 zones de peau + 6 zones de cheveux"
                    ),
                    L(
                        "染色码 C/H + Base36，复制即可导入",
                        "染色碼 C/H + Base36，複製即可匯入",
                        "Dye codes: C/H + Base36, copy to import",
                        "染色コードはC/H＋Base36、コピーで取り込み",
                        "염색 코드 C/H + Base36, 복사해서 가져오기",
                        "Codes C/H + Base36, à copier pour importer"
                    ),
                    L(
                        "相似色用 OKLab ΔE，发布需登录",
                        "相似色用 OKLab ΔE，發佈需登入",
                        "OKLab ΔE for similar colors; login to publish",
                        "類似色はOKLab ΔE、公開にはログイン",
                        "유사색은 OKLab ΔE, 게시하려면 로그인",
                        "ΔE OKLab pour les couleurs, connexion pour publier"
                    ),
                ],
                route: "/skin-colorize",
                routeLabel: L("去染色广场", "去染色廣場", "Open dye gallery", "染色ギャラリーへ", "염색 갤러리로", "Aller à la galerie"),
                hint: L(
                    "先复制一套方案，再进编辑器微调",
                    "先複製一套方案，再進編輯器微調",
                    "Copy a scheme first, then fine-tune it",
                    "まず染色プランをコピーして微調整",
                    "먼저 배색안을 복사한 뒤 미세 조정",
                    "Copiez un schéma, puis ajustez-le"
                ),
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "现在，去广场挑一套，改成你的颜色。",
                        "現在，去廣場挑一套，改成你的顏色。",
                        "Now pick a scheme and make the colors yours.",
                        "さあ、ギャラリーで選んで自分の色に。",
                        "이제 갤러리에서 골라 내 색으로 바꿔 보세요.",
                        "Choisissez un schéma et faites-en vos couleurs."
                    ),
                },
            ],
        },
    ],
}
