import { L, type Tutorial } from "../types"

const saiq = L("赛琪", "賽琪", "Saiqi", "サイキ", "사이치", "Saiqi")
const lise = L("黎瑟", "黎瑟", "Lise", "リーゼ", "리제", "Lise")
const berenica = L("贝蕾妮卡", "貝蕾妮卡", "Berenica", "ベレニカ", "베레니카", "Berenica")
const daphne = L("达芙涅", "達芙涅", "Daphne", "ダフネ", "다프네", "Daphné")
const flora = L("芙罗拉", "芙羅拉", "Flora", "フローラ", "플로라", "Flora")
const kaja = L("卡嘉", "卡嘉", "Kaja", "カジャ", "카자", "Kaja")
const siren = L("塞壬的拥吻", "塞壬的擁吻", "Siren's Kiss", "セイレーンの口づけ", "세이렌의 입맞춤", "Baiser de Sirène")
const saiqTitle = L("茧的白昼梦", "繭的白晝夢", "Daydream of the Cocoon", "繭の白昼夢", "고치의 백일몽", "Rêve diurne du cocon")

export const databaseMapTutorial: Tutorial = {
    id: "database-map",
    number: "06",
    category: "data",
    title: L("资料库与地图", "資料庫與地圖", "Database & Maps", "データベースと地図", "데이터베이스와 지도", "Base de données et cartes"),
    subtitle: L(
        "先检索，再查详情，最后落到坐标",
        "先檢索，再查詳情，最後落到座標",
        "Search, read the entry, then land on the coordinate",
        "検索して、詳細を読んで、座標へ",
        "검색하고, 상세를 읽고, 좌표로",
        "Chercher, lire la fiche, puis arriver aux coordonnées"
    ),
    summary: L(
        "35 个模块、全局搜索、列表与详情、任务全文检索、AI 与 OCR 边界，再到本地分层地图与在线瓦片地图。",
        "35 個模組、全域搜尋、列表與詳情、任務全文檢索、AI 與 OCR 邊界，再到本地分層地圖與線上瓦片地圖。",
        "35 modules, global search, list-and-detail, quest full-text search, AI and OCR limits, then layered local maps and online tile maps.",
        "35 モジュール、横断検索、一覧と詳細、クエスト全文検索、AI と OCR の境界、ローカル階層マップとオンラインタイルマップまで。",
        "35개 모듈, 전역 검색, 목록과 상세, 퀘스트 전문 검색, AI와 OCR 경계, 로컬 레이어 지도와 온라인 타일 지도까지.",
        "35 modules, recherche globale, liste et fiche, recherche plein texte des quêtes, limites de l'IA et de l'OCR, puis cartes locales en couches et cartes en tuiles en ligne."
    ),
    icon: "ri:database-2-line",
    accent: "#00c6ff",
    route: "/db",
    routeLabel: L("打开资料库", "開啟資料庫", "Open Database", "データベースを開く", "데이터베이스 열기", "Ouvrir la base"),
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
                    "EP 06 · 资料与工具",
                    "EP 06 · 資料與工具",
                    "EP 06 · DATA & TOOLS",
                    "EP 06 · データとツール",
                    "EP 06 · 데이터와 도구",
                    "EP 06 · DONNÉES ET OUTILS"
                ),
                title: L(
                    "资料库与地图",
                    "資料庫與地圖",
                    "Database & Maps",
                    "データベースと地図",
                    "데이터베이스와 지도",
                    "Base de données et cartes"
                ),
                subtitle: L(
                    "先检索，再查详情，最后落到坐标。",
                    "先檢索，再查詳情，最後落到座標。",
                    "Search first, read the entry, then land on the coordinate.",
                    "まず検索、次に詳細、最後に座標へ。",
                    "먼저 검색하고, 상세를 읽고, 마지막에 좌표로.",
                    "Cherchez, lisez la fiche, puis arrivez aux coordonnées."
                ),
                icon: "ri:database-2-line",
                index: "06",
            },
            captions: [
                {
                    at: 0.9,
                    text: L(
                        "资料库是入口，地图是出口；中间靠搜索和详情。",
                        "資料庫是入口，地圖是出口；中間靠搜尋和詳情。",
                        "The database is the entrance, the map is the exit; search and detail are the path.",
                        "データベースが入口、地図が出口。間は検索と詳細でつなぎます。",
                        "데이터베이스가 입구, 지도가 출구입니다. 그 사이는 검색과 상세로 잇습니다.",
                        "La base est l'entrée, la carte la sortie ; la recherche et les fiches font le lien."
                    ),
                },
            ],
        },
        {
            id: "modules",
            chapter: L("总览", "總覽", "Overview", "概要", "개요", "Vue d'ensemble"),
            duration: 9,
            shot: {
                type: "cards",
                kicker: "35 MODULES",
                title: L("五区总览", "五區總覽", "Five sections", "5つのセクション", "다섯 구역", "Cinq sections"),
                sidebar: {
                    items: [
                        { label: L("构筑", "構築", "Build", "構築", "빌드", "Construction"), icon: "ri:hammer-line" },
                        { label: L("探索", "探索", "Explore", "探索", "탐색", "Exploration"), icon: "ri:compass-3-line" },
                        { label: L("世界", "世界", "World", "世界", "세계", "Monde"), icon: "ri:map-2-line" },
                        { label: L("挑战", "挑戰", "Challenge", "挑戦", "도전", "Défi"), icon: "ri:sword-line" },
                        { label: L("收集", "收集", "Collect", "収集", "수집", "Collection"), icon: "ri:inbox-line" },
                    ],
                    active: 0,
                },
                items: [
                    {
                        title: L("角色", "角色", "Characters", "キャラクター", "캐릭터", "Personnages"),
                        subtitle: L(
                            "属性 / 技能 / 语音",
                            "屬性 / 技能 / 語音",
                            "Stats, skills, voice",
                            "属性・スキル・ボイス",
                            "속성, 스킬, 보이스",
                            "Stats, compétences, voix"
                        ),
                        icon: "ri:user-line",
                        meta: L("构筑", "構築", "Build", "構築", "빌드", "Construction"),
                    },
                    {
                        title: L("武器", "武器", "Weapons", "武器", "무기", "Armes"),
                        subtitle: L(
                            "适用 / 突破 / 制造 / 灾厄",
                            "適用 / 突破 / 製造 / 災厄",
                            "Applicable, breakthrough, craft, calamity",
                            "適用・突破・製造・災厄",
                            "적용, 돌파, 제작, 재앙",
                            "Applicable, percée, fabrication, calamité"
                        ),
                        icon: "ri:sword-line",
                        meta: L("构筑", "構築", "Build", "構築", "빌드", "Construction"),
                    },
                    {
                        title: L("魔之楔", "魔之楔", "Mods", "魔之楔", "모드", "Mods"),
                        subtitle: L(
                            "极性 / 效果 / 来源",
                            "極性 / 效果 / 來源",
                            "Polarity, effect, source",
                            "極性・効果・入手",
                            "극성, 효과, 출처",
                            "Polarité, effet, source"
                        ),
                        icon: "ri:puzzle-line",
                        meta: L("构筑", "構築", "Build", "構築", "빌드", "Construction"),
                    },
                    {
                        title: L("任务剧情", "任務劇情", "Quests", "クエスト", "퀘스트", "Quêtes"),
                        subtitle: L(
                            "对白 / 选项 / 说话人",
                            "對白 / 選項 / 說話人",
                            "Dialogue, choices, speakers",
                            "セリフ・選択肢・話者",
                            "대사, 선택지, 화자",
                            "Dialogues, choix, locuteurs"
                        ),
                        icon: "ri:book-open-line",
                        meta: L("世界", "世界", "World", "世界", "세계", "Monde"),
                    },
                    {
                        title: L("伤害计算", "傷害計算", "Damage calc", "ダメージ計算", "피해 계산", "Calcul de dégâts"),
                        subtitle: L(
                            "技能 / 武器 / DOT",
                            "技能 / 武器 / DOT",
                            "Skill, weapon, DOT",
                            "スキル・武器・DOT",
                            "스킬, 무기, DOT",
                            "Compétence, arme, DOT"
                        ),
                        icon: "ri:calculator-line",
                        meta: L("构筑", "構築", "Build", "構築", "빌드", "Construction"),
                    },
                    {
                        title: L("魔灵地图", "魔靈地圖", "Pet map", "魔霊マップ", "마령 지도", "Carte des familiers"),
                        subtitle: L(
                            "图层 / 资源 / 传送点",
                            "圖層 / 資源 / 傳送點",
                            "Layers, resources, teleports",
                            "レイヤー・資源・転送点",
                            "레이어, 자원, 전송점",
                            "Calques, ressources, téléports"
                        ),
                        icon: "ri:map-2-line",
                        meta: L("探索", "探索", "Explore", "探索", "탐색", "Exploration"),
                    },
                    {
                        title: L("在线地图", "線上地圖", "Online map", "オンラインマップ", "온라인 지도", "Carte en ligne"),
                        subtitle: L(
                            "瓦片 / 标记 / 楼层",
                            "瓦片 / 標記 / 樓層",
                            "Tiles, markers, floors",
                            "タイル・マーカー・フロア",
                            "타일, 마커, 층",
                            "Tuiles, marqueurs, étages"
                        ),
                        icon: "ri:compass-3-line",
                        meta: L("探索", "探索", "Explore", "探索", "탐색", "Exploration"),
                    },
                    {
                        title: L("成就", "成就", "Achievements", "実績", "업적", "Succès"),
                        subtitle: L(
                            "分类 / 奖励 / 版本",
                            "分類 / 獎勵 / 版本",
                            "Category, rewards, version",
                            "分類・報酬・バージョン",
                            "분류, 보상, 버전",
                            "Catégorie, récompenses, version"
                        ),
                        icon: "ri:trophy-line",
                        meta: L("收集", "收集", "Collect", "収集", "수집", "Collection"),
                    },
                ],
                columns: 4,
                footnote: L(
                    "共 35 个模块 · 五区并排",
                    "共 35 個模組 · 五區並排",
                    "35 modules across five sections",
                    "全35モジュール・5セクション",
                    "총 35개 모듈, 다섯 구역",
                    "35 modules, cinq sections"
                ),
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "总览共 35 个模块，分构筑、探索、世界、挑战、收集五区。",
                        "總覽共 35 個模組，分構築、探索、世界、挑戰、收集五區。",
                        "The overview holds 35 modules, split into Build, Explore, World, Challenge, and Collect.",
                        "概要は35モジュール。構築・探索・世界・挑戦・収集の5区です。",
                        "개요에는 35개 모듈이 빌드, 탐색, 세계, 도전, 수집 다섯 구역으로 나뉩니다.",
                        "La vue d'ensemble compte 35 modules, répartis en Construction, Exploration, Monde, Défi et Collection."
                    ),
                },
                {
                    at: 5.2,
                    text: L(
                        "宽屏 8 列、窄屏 4 列；点卡片进入对应列表。",
                        "寬螢幕 8 欄、窄螢幕 4 欄；點卡片進入對應列表。",
                        "Eight columns on wide screens, four on narrow; click a card to open its list.",
                        "広い画面は8列、狭い画面は4列。カードから一覧へ。",
                        "넓은 화면은 8열, 좁은 화면은 4열입니다. 카드를 눌러 목록으로.",
                        "Huit colonnes sur grand écran, quatre sur petit ; cliquez une carte pour ouvrir la liste."
                    ),
                },
            ],
        },
        {
            id: "search",
            chapter: L("全局搜索", "全域搜尋", "Global search", "横断検索", "전역 검색", "Recherche globale"),
            duration: 9.5,
            shot: {
                type: "database",
                title: L("全局搜索", "全域搜尋", "Global search", "横断検索", "전역 검색", "Recherche globale"),
                search: L("saiqi", "saiqi", "saiqi", "saiqi", "saiqi", "saiqi"),
                filters: [
                    L("全部", "全部", "All", "すべて", "전체", "Tout"),
                    L("角色", "角色", "Characters", "キャラ", "캐릭터", "Personnages"),
                    L("武器", "武器", "Weapons", "武器", "무기", "Armes"),
                    L("魔之楔", "魔之楔", "Mods", "魔之楔", "모드", "Mods"),
                    L("任务剧情", "任務劇情", "Quests", "クエスト", "퀘스트", "Quêtes"),
                ],
                list: [
                    {
                        title: saiq,
                        meta: L("角色 · 5301", "角色 · 5301", "Character · 5301", "キャラ · 5301", "캐릭터 · 5301", "Personnage · 5301"),
                        icon: "ri:user-line",
                        active: true,
                    },
                    {
                        title: siren,
                        meta: L("武器 · 近战", "武器 · 近戰", "Weapon · Melee", "武器 · 近接", "무기 · 근접", "Arme · Mêlée"),
                        icon: "ri:sword-line",
                    },
                    {
                        title: L("攻势", "攻勢", "Offensive", "攻勢", "공세", "Offensive"),
                        meta: L("魔之楔 · 攻击", "魔之楔 · 攻擊", "Mod · ATK", "魔之楔 · 攻撃", "모드 · 공격", "Mod · ATQ"),
                        icon: "ri:puzzle-line",
                    },
                    {
                        title: lise,
                        meta: L("角色 · 4101", "角色 · 4101", "Character · 4101", "キャラ · 4101", "캐릭터 · 4101", "Personnage · 4101"),
                        icon: "ri:user-line",
                    },
                    {
                        title: berenica,
                        meta: L("角色 · 1101", "角色 · 1101", "Character · 1101", "キャラ · 1101", "캐릭터 · 1101", "Personnage · 1101"),
                        icon: "ri:user-line",
                    },
                    {
                        title: daphne,
                        meta: L("角色 · 3101", "角色 · 3101", "Character · 3101", "キャラ · 3101", "캐릭터 · 3101", "Personnage · 3101"),
                        icon: "ri:user-line",
                    },
                ],
                detail: {
                    title: saiq,
                    subtitle: L(
                        "茧的白昼梦 · 角色",
                        "繭的白晝夢 · 角色",
                        "Daydream of the Cocoon · Character",
                        "繭の白昼夢 · キャラ",
                        "고치의 백일몽 · 캐릭터",
                        "Rêve diurne du cocon · Personnage"
                    ),
                    icon: "ri:user-line",
                    stats: [
                        { label: L("攻击", "攻擊", "ATK", "攻撃", "공격", "ATQ"), value: "1,286" },
                        { label: L("暴击率", "暴擊率", "CRIT RATE", "会心率", "치명타율", "TAUX CRIT"), value: "62.4%" },
                        { label: L("暴击伤害", "暴擊傷害", "CRIT DMG", "会心ダメージ", "치명타 피해", "DÉGÂTS CRIT"), value: "218%" },
                    ],
                    tabs: [
                        L("档案", "檔案", "Profile", "プロフィール", "프로필", "Profil"),
                        L("皮肤", "皮膚", "Skins", "スキン", "스킨", "Apparences"),
                        L("语音", "語音", "Voice", "ボイス", "보이스", "Voix"),
                        L("获取方式", "獲取方式", "Obtain", "入手方法", "획득 방법", "Obtention"),
                    ],
                    activeTab: 1,
                    paragraphs: [
                        L(
                            "名称、拼音、别名和数字 ID 都会命中。",
                            "名稱、拼音、別名和數字 ID 都會命中。",
                            "Name, pinyin, alias, and numeric ID all match.",
                            "名前・ピンイン・別名・数字 ID に一致します。",
                            "이름, 병음, 별칭, 숫자 ID 모두 매칭됩니다.",
                            "Nom, pinyin, alias et ID numérique correspondent."
                        ),
                        L(
                            "搜索最多 20 个字，总览最多列 6 条结果。",
                            "搜尋最多 20 個字，總覽最多列 6 條結果。",
                            "Up to 20 characters; the overview lists at most six results.",
                            "検索は20文字まで、概要は最大6件。",
                            "검색은 최대 20자, 개요는 최대 6개 결과.",
                            "20 caractères maximum ; six résultats au plus dans la vue d'ensemble."
                        ),
                    ],
                },
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "顶部搜索支持名称、拼音、别名和数字 ID；关键词最多 20 字。",
                        "頂部搜尋支援名稱、拼音、別名和數字 ID；關鍵詞最多 20 字。",
                        "Search matches name, pinyin, alias, and numeric ID; keywords cap at 20 characters.",
                        "検索は名前・ピンイン・別名・数字 ID に対応。キーワードは20文字まで。",
                        "검색은 이름, 병음, 별칭, 숫자 ID를 지원하며 키워드는 최대 20자입니다.",
                        "La recherche accepte nom, pinyin, alias et ID numérique ; 20 caractères maximum."
                    ),
                },
                {
                    at: 5.2,
                    text: L(
                        "总览最多列 6 条结果；更完整的列表在对应模块里。",
                        "總覽最多列 6 條結果；更完整的列表在對應模組裡。",
                        "The overview lists at most six hits; full lists live in their modules.",
                        "概要は最大6件。完全な一覧は各モジュールにあります。",
                        "개요는 최대 6개 결과만 보여 주며, 전체 목록은 해당 모듈에 있습니다.",
                        "La vue d'ensemble affiche six résultats au plus ; les listes complètes sont dans les modules."
                    ),
                },
            ],
            callouts: [
                {
                    at: 2.2,
                    text: L(
                        "名称 / 拼音 / 别名 / ID",
                        "名稱 / 拼音 / 別名 / ID",
                        "Name / pinyin / alias / ID",
                        "名前 / ピンイン / 別名 / ID",
                        "이름 / 병음 / 별칭 / ID",
                        "Nom / pinyin / alias / ID"
                    ),
                    x: 30,
                    y: 20,
                },
                {
                    at: 7.0,
                    text: L("最多 6 条结果", "最多 6 條結果", "At most 6 results", "最大6件", "최대 6개 결과", "6 résultats au plus"),
                    x: 30,
                    y: 76,
                },
            ],
        },
        {
            id: "list-detail",
            chapter: L("列表与详情", "列表與詳情", "List & detail", "一覧と詳細", "목록과 상세", "Liste et fiche"),
            duration: 10,
            shot: {
                type: "database",
                title: L("角色与武器", "角色與武器", "Characters & weapons", "キャラと武器", "캐릭터와 무기", "Personnages et armes"),
                search: L("搜索角色", "搜尋角色", "Search characters", "キャラを検索", "캐릭터 검색", "Chercher un personnage"),
                filters: [
                    L("元素", "元素", "Element", "元素", "원소", "Élément"),
                    L("版本", "版本", "Version", "バージョン", "버전", "Version"),
                    L("职业", "職業", "Profession", "職種", "직업", "Classe"),
                    L("阵营", "陣營", "Faction", "陣営", "진영", "Faction"),
                ],
                list: [
                    {
                        title: saiq,
                        meta: L("风 · 5301", "風 · 5301", "Wind · 5301", "風 · 5301", "바람 · 5301", "Vent · 5301"),
                        icon: "ri:user-line",
                        active: true,
                    },
                    {
                        title: lise,
                        meta: L("雷 · 4101", "雷 · 4101", "Lightning · 4101", "雷 · 4101", "번개 · 4101", "Foudre · 4101"),
                        icon: "ri:user-line",
                    },
                    {
                        title: berenica,
                        meta: L("光 · 1101", "光 · 1101", "Light · 1101", "光 · 1101", "빛 · 1101", "Lumière · 1101"),
                        icon: "ri:user-line",
                    },
                    {
                        title: daphne,
                        meta: L("水 · 3101", "水 · 3101", "Water · 3101", "水 · 3101", "물 · 3101", "Eau · 3101"),
                        icon: "ri:user-line",
                    },
                    {
                        title: flora,
                        meta: L("暗 · 1102", "暗 · 1102", "Dark · 1102", "闇 · 1102", "어둠 · 1102", "Ténèbres · 1102"),
                        icon: "ri:user-line",
                    },
                    {
                        title: kaja,
                        meta: L("火 · 3203", "火 · 3203", "Fire · 3203", "火 · 3203", "불 · 3203", "Feu · 3203"),
                        icon: "ri:shield-line",
                    },
                ],
                detail: {
                    title: saiq,
                    subtitle: saiqTitle,
                    icon: "ri:user-line",
                    stats: [
                        { label: L("等级", "等級", "LEVEL", "レベル", "레벨", "NIVEAU"), value: "80" },
                        { label: L("技能", "技能", "SKILL", "スキル", "스킬", "COMPÉTENCE"), value: "12" },
                        { label: L("攻击", "攻擊", "ATK", "攻撃", "공격", "ATQ"), value: "1,286" },
                        { label: L("版本", "版本", "VERSION", "バージョン", "버전", "VERSION"), value: "1.0" },
                    ],
                    tabs: [
                        L("档案", "檔案", "Profile", "プロフィール", "프로필", "Profil"),
                        L("皮肤", "皮膚", "Skins", "スキン", "스킨", "Apparences"),
                        L("语音", "語音", "Voice", "ボイス", "보이스", "Voix"),
                        L("获取方式", "獲取方式", "Obtain", "入手方法", "획득 방법", "Obtention"),
                    ],
                    activeTab: 1,
                    paragraphs: [
                        L(
                            "默认等级 80、技能等级 12。",
                            "預設等級 80、技能等級 12。",
                            "Level 80 and skill level 12 by default.",
                            "既定はレベル80、スキルレベル12。",
                            "기본 레벨 80, 스킬 레벨 12.",
                            "Niveau 80 et compétence niveau 12 par défaut."
                        ),
                        L(
                            "皮肤、语音、获取方式都在右侧页签里。",
                            "皮膚、語音、獲取方式都在右側頁籤裡。",
                            "Skins, voice, and obtain methods live in the right-hand tabs.",
                            "スキン・ボイス・入手方法は右側のタブに。",
                            "스킨, 보이스, 획득 방법은 오른쪽 탭에 있습니다.",
                            "Apparences, voix et obtention sont dans les onglets de droite."
                        ),
                    ],
                },
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "列表和详情同屏；角色页签是档案、皮肤、语音、获取方式。",
                        "列表和詳情同屏；角色頁籤是檔案、皮膚、語音、獲取方式。",
                        "List and detail share the screen; character tabs are Profile, Skins, Voice, and Obtain.",
                        "一覧と詳細は同じ画面。キャラのタブはプロフィール・スキン・ボイス・入手方法。",
                        "목록과 상세가 한 화면입니다. 캐릭터 탭은 프로필, 스킨, 보이스, 획득 방법입니다.",
                        "Liste et fiche sur un même écran ; les onglets sont Profil, Apparences, Voix et Obtention."
                    ),
                },
                {
                    at: 5.4,
                    text: L(
                        "武器详情换成适用、突破、制造、灾厄，同样一屏看完。",
                        "武器詳情換成適用、突破、製造、災厄，同樣一屏看完。",
                        "Weapon detail swaps to Applicable, Breakthrough, Craft, and Calamity, still on one screen.",
                        "武器の詳細は適用・突破・製造・災厄。こちらも一画面で。",
                        "무기 상세는 적용, 돌파, 제작, 재앙 탭으로 바뀌며 역시 한 화면입니다.",
                        "La fiche d'arme passe à Applicable, Percée, Fabrication et Calamité, toujours sur un écran."
                    ),
                },
            ],
            callouts: [
                {
                    at: 3.0,
                    text: L("角色四页签", "角色四頁籤", "Four character tabs", "キャラは4タブ", "캐릭터 4탭", "Quatre onglets personnage"),
                    x: 62,
                    y: 40,
                },
            ],
            note: L("列表 + 详情同屏", "列表 + 詳情同屏", "List + detail", "一覧 + 詳細", "목록 + 상세", "Liste + fiche"),
        },
        {
            id: "quest-search",
            chapter: L("任务剧情", "任務劇情", "Quest text", "クエスト本文", "퀘스트 본문", "Texte de quête"),
            duration: 9,
            shot: {
                type: "database",
                title: L("全文搜索", "全文搜尋", "Full-text search", "全文検索", "전문 검색", "Recherche plein texte"),
                search: L("台词", "臺詞", "dialogue", "セリフ", "대사", "dialogue"),
                filters: [
                    L("全文搜索", "全文搜尋", "Full text", "全文検索", "전문 검색", "Texte intégral"),
                    L("印象检定", "印象檢定", "Impression check", "印象検定", "인상 판정", "Test d'impression"),
                    L("类型", "類型", "Type", "種類", "유형", "Type"),
                    L("版本", "版本", "Version", "バージョン", "버전", "Version"),
                    L("说话人", "說話人", "Speaker", "話者", "화자", "Locuteur"),
                ],
                list: [
                    {
                        title: L("任务名命中", "任務名命中", "Quest name hit", "クエスト名に一致", "퀘스트명 일치", "Nom de quête trouvé"),
                        meta: L("标题", "標題", "Title", "タイトル", "제목", "Titre"),
                        icon: "ri:book-open-line",
                    },
                    {
                        title: L("对白命中", "對白命中", "Dialogue hit", "セリフに一致", "대사 일치", "Dialogue trouvé"),
                        meta: L("对白", "對白", "Dialogue", "セリフ", "대사", "Dialogue"),
                        icon: "ri:chat-3-line",
                        active: true,
                    },
                    {
                        title: L("选项命中", "選項命中", "Choice hit", "選択肢に一致", "선택지 일치", "Choix trouvé"),
                        meta: L("选项", "選項", "Choice", "選択肢", "선택지", "Choix"),
                        icon: "ri:list-check-2",
                    },
                    {
                        title: L("说话人命中", "說話人命中", "Speaker hit", "話者に一致", "화자 일치", "Locuteur trouvé"),
                        meta: L("说话人", "說話人", "Speaker", "話者", "화자", "Locuteur"),
                        icon: "ri:user-search-line",
                    },
                    {
                        title: L("描述命中", "描述命中", "Description hit", "説明に一致", "설명 일치", "Description trouvée"),
                        meta: L("描述", "描述", "Description", "説明", "설명", "Description"),
                        icon: "ri:file-list-line",
                    },
                    {
                        title: L("印象检定", "印象檢定", "Impression check", "印象検定", "인상 판정", "Test d'impression"),
                        meta: L("条件", "條件", "Condition", "条件", "조건", "Condition"),
                        icon: "ri:shield-check-line",
                    },
                ],
                detail: {
                    title: L("任务剧情", "任務劇情", "Quest story", "クエスト", "퀘스트", "Quête"),
                    subtitle: L(
                        "全文搜索 · 命中片段高亮",
                        "全文搜尋 · 命中片段高亮",
                        "Full-text search · hits highlighted",
                        "全文検索・一致箇所を強調",
                        "전문 검색 · 일치 부분 강조",
                        "Recherche plein texte · passages surlignés"
                    ),
                    icon: "ri:book-open-line",
                    stats: [
                        { label: L("搜索范围", "搜尋範圍", "SCOPE", "検索範囲", "검색 범위", "PORTÉE"), value: "FULL" },
                        { label: L("命中", "命中", "HITS", "一致", "일치", "RÉSULTATS"), value: "6" },
                        { label: L("高亮", "高亮", "HIGHLIGHT", "強調", "강조", "SURLIGNAGE"), value: "ON" },
                    ],
                    tabs: [
                        L("任务", "任務", "Quest", "クエスト", "퀘스트", "Quête"),
                        L("对白", "對白", "Dialogue", "セリフ", "대사", "Dialogue"),
                        L("选项", "選項", "Choice", "選択肢", "선택지", "Choix"),
                    ],
                    activeTab: 1,
                    paragraphs: [
                        L(
                            "搜索覆盖任务名、描述、对白、选项和说话人。",
                            "搜尋覆蓋任務名、描述、對白、選項和說話人。",
                            "Search covers quest names, descriptions, dialogue, choices, and speakers.",
                            "検索対象はクエスト名・説明・セリフ・選択肢・話者。",
                            "검색 범위는 퀘스트명, 설명, 대사, 선택지, 화자입니다.",
                            "La recherche couvre noms, descriptions, dialogues, choix et locuteurs."
                        ),
                        L(
                            "命中片段会高亮，点进详情用对话阅读器继续看。",
                            "命中片段會高亮，點進詳情用對話閱讀器繼續看。",
                            "Hits are highlighted; open the entry and keep reading in the dialogue reader.",
                            "一致箇所は強調され、詳細の会話リーダーで続きを読めます。",
                            "일치 부분은 강조되며 상세의 대화 리더에서 이어서 볼 수 있습니다.",
                            "Les passages sont surlignés ; ouvrez la fiche et poursuivez dans le lecteur de dialogue."
                        ),
                    ],
                },
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "开启「全文搜索」，任务名、描述、对白、选项、说话人都能命中。",
                        "開啟「全文搜尋」，任務名、描述、對白、選項、說話人都能命中。",
                        "Turn on full-text search: quest names, descriptions, dialogue, choices, and speakers all match.",
                        "「全文検索」でクエスト名・説明・セリフ・選択肢・話者に一致。",
                        "「전문 검색」을 켜면 퀘스트명, 설명, 대사, 선택지, 화자 모두 매칭됩니다.",
                        "Activez la recherche plein texte : noms, descriptions, dialogues, choix et locuteurs correspondent."
                    ),
                },
                {
                    at: 5.2,
                    text: L(
                        "命中片段高亮，点进详情可用对话阅读器继续读。",
                        "命中片段高亮，點進詳情可用對話閱讀器繼續讀。",
                        "Hits are highlighted; open the detail and read on in the dialogue reader.",
                        "一致箇所は強調。詳細の会話リーダーで続きを読めます。",
                        "일치 부분이 강조되며, 상세의 대화 리더에서 계속 읽을 수 있습니다.",
                        "Les passages sont surlignés ; poursuivez dans le lecteur de dialogue."
                    ),
                },
            ],
            callouts: [
                {
                    at: 2.8,
                    text: L("全文搜索", "全文搜尋", "Full-text search", "全文検索", "전문 검색", "Recherche plein texte"),
                    x: 32,
                    y: 24,
                },
                {
                    at: 7.0,
                    text: L("命中片段高亮", "命中片段高亮", "Hits highlighted", "一致箇所を強調", "일치 부분 강조", "Passages surlignés"),
                    x: 66,
                    y: 60,
                },
            ],
            note: L(
                "任务名 + 对白 + 选项",
                "任務名 + 對白 + 選項",
                "Names + dialogue + choices",
                "名前 + セリフ + 選択肢",
                "이름 + 대사 + 선택지",
                "Noms + dialogues + choix"
            ),
        },
        {
            id: "ai-ocr",
            chapter: L("AI 与识别", "AI 與辨識", "AI & OCR", "AI と OCR", "AI와 OCR", "IA et OCR"),
            duration: 9,
            shot: {
                type: "callout",
                kicker: "AI · OCR",
                title: L(
                    "能问，但有边界",
                    "能問，但有邊界",
                    "Ask, within limits",
                    "質問できる。ただし境界あり",
                    "질문할 수 있지만 경계가 있습니다",
                    "Demandez, mais dans les limites"
                ),
                icon: "ri:robot-2-line",
                points: [
                    {
                        icon: "ri:chat-3-line",
                        text: L(
                            "输入 $ 调出技能面板，插入技能 chip",
                            "輸入 $ 調出技能面板，插入技能 chip",
                            "Type $ to open the skill panel and insert a skill chip",
                            "$ でスキルパネルを開き、スキル chip を挿入",
                            "$를 입력해 스킬 패널을 열고 스킬 chip을 삽입",
                            "Tapez $ pour ouvrir le panneau de compétences et insérer un chip"
                        ),
                    },
                    {
                        icon: "ri:image-line",
                        text: L(
                            "图片最多 4 张",
                            "圖片最多 4 張",
                            "Up to 4 images",
                            "画像は最大4枚",
                            "이미지는 최대 4장",
                            "Quatre images maximum"
                        ),
                    },
                    {
                        icon: "ri:lock-line",
                        text: L(
                            "RAG 默认关闭，首句后锁定",
                            "RAG 預設關閉，首句後鎖定",
                            "RAG is off by default and locks after the first message",
                            "RAG は既定でオフ、最初の発言後に固定",
                            "RAG는 기본 꺼짐, 첫 메시지 후 잠김",
                            "RAG désactivé par défaut, verrouillé après le premier message"
                        ),
                    },
                    {
                        icon: "ri:screenshot-2-line",
                        text: L(
                            "OCR 与实时识别仅桌面端",
                            "OCR 與即時辨識僅桌面端",
                            "OCR and live recognition are desktop-only",
                            "OCR とリアルタイム認識はデスクトップのみ",
                            "OCR과 실시간 인식은 데스크톱 전용",
                            "OCR et reconnaissance en direct : bureau uniquement"
                        ),
                    },
                ],
                note: L(
                    "RAG = 实验性上下文检索增强",
                    "RAG = 實驗性上下文檢索增強",
                    "RAG = experimental context retrieval",
                    "RAG = 実験的な文脈検索強化",
                    "RAG = 실험적 문맥 검색 강화",
                    "RAG = enrichissement contextuel expérimental"
                ),
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "输入 $ 调出技能面板，最多附 4 张图片，Enter 发送。",
                        "輸入 $ 調出技能面板，最多附 4 張圖片，Enter 發送。",
                        "Type $ for the skill panel, attach up to four images, then press Enter.",
                        "$ でスキルパネル、画像は最大4枚、Enter で送信。",
                        "$로 스킬 패널, 이미지 최대 4장, Enter로 전송.",
                        "Tapez $ pour les compétences, jusqu'à quatre images, puis Entrée."
                    ),
                },
                {
                    at: 5.2,
                    text: L(
                        "RAG 默认关闭，首句后锁定；OCR 只在桌面端可用。",
                        "RAG 預設關閉，首句後鎖定；OCR 只在桌面端可用。",
                        "RAG starts off and locks after the first message; OCR only runs on desktop.",
                        "RAG は既定でオフ、最初の発言後に固定。OCR はデスクトップのみ。",
                        "RAG는 기본 꺼짐이며 첫 메시지 후 잠깁니다. OCR은 데스크톱 전용입니다.",
                        "RAG est désactivé et se verrouille après le premier message ; l'OCR est réservé au bureau."
                    ),
                },
            ],
            note: L(
                "OCR 仅桌面端",
                "OCR 僅桌面端",
                "OCR: desktop only",
                "OCR はデスクトップのみ",
                "OCR 데스크톱 전용",
                "OCR : bureau uniquement"
            ),
        },
        {
            id: "data-rules",
            chapter: L("数据口径", "資料口徑", "Data rules", "データの前提", "데이터 기준", "Règles de données"),
            duration: 8.5,
            shot: {
                type: "callout",
                kicker: "DATA RULES",
                title: L(
                    "数字有前提",
                    "數字有前提",
                    "Numbers have preconditions",
                    "数字には前提がある",
                    "숫자에는 전제가 있습니다",
                    "Les chiffres ont des conditions"
                ),
                icon: "ri:shield-check-line",
                points: [
                    {
                        icon: "ri:calculator-line",
                        text: L(
                            "伤害计算器可「从当前构筑导入」",
                            "傷害計算器可「從目前構築匯入」",
                            "Damage calc can import from the current build",
                            "ダメージ計算は「現在の構築から取り込み」可能",
                            "피해 계산기는 「현재 빌드에서 가져오기」 가능",
                            "Le calcul de dégâts peut importer la construction actuelle"
                        ),
                    },
                    {
                        icon: "ri:refresh-line",
                        text: L(
                            "导入会覆盖当前模式的输入",
                            "匯入會覆蓋目前模式的輸入",
                            "Importing overwrites the current mode's inputs",
                            "取り込むと現在モードの入力は上書きされる",
                            "가져오면 현재 모드 입력이 덮어쓰입니다",
                            "L'import écrase les entrées du mode courant"
                        ),
                    },
                    {
                        icon: "ri:shield-line",
                        text: L(
                            "安全模式把版本上限锁在 1.7",
                            "安全模式把版本上限鎖在 1.7",
                            "Safe mode caps the version at 1.7",
                            "セーフモードはバージョン上限を1.7に固定",
                            "안전 모드는 버전 상한을 1.7로 고정합니다",
                            "Le mode sûr plafonne la version à 1.7"
                        ),
                    },
                    {
                        icon: "ri:filter-line",
                        text: L(
                            "超版本条目被过滤，搜索会提示不完整",
                            "超版本條目被過濾，搜尋會提示不完整",
                            "Newer entries are filtered out; search warns it may be incomplete",
                            "上限超えは除外され、検索も不完全と表示",
                            "초과 버전 항목은 제외되고 검색도 불완전하다고 안내합니다",
                            "Les entrées trop récentes sont filtrées ; la recherche signale une liste incomplète"
                        ),
                    },
                ],
                note: L(
                    "安全模式在桌面端设置，关闭需答题",
                    "安全模式在桌面端設定，關閉需答題",
                    "Safe mode is set on desktop; turning it off requires a quiz",
                    "セーフモードはデスクトップで設定。解除には問題回答が必要",
                    "안전 모드는 데스크톱에서 설정하며 해제하려면 문제를 풀어야 합니다",
                    "Le mode sûr se règle sur bureau ; le désactiver demande un questionnaire"
                ),
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "伤害计算器可以「从当前构筑导入」，但会覆盖当前模式的输入。",
                        "傷害計算器可以「從目前構築匯入」，但會覆蓋目前模式的輸入。",
                        "Damage calc can import from the current build, but it overwrites the current mode's inputs.",
                        "ダメージ計算は構築から取り込めますが、現在モードの入力は上書きされます。",
                        "피해 계산기는 현재 빌드에서 가져올 수 있지만 현재 모드 입력은 덮어씁니다.",
                        "Le calcul de dégâts importe la construction, mais écrase les entrées du mode courant."
                    ),
                },
                {
                    at: 5.0,
                    text: L(
                        "安全模式把版本锁在 1.7；超版本条目会被过滤，搜索也会提示。",
                        "安全模式把版本鎖在 1.7；超版本條目會被過濾，搜尋也會提示。",
                        "Safe mode locks the version at 1.7; newer entries are filtered and search warns you.",
                        "セーフモードは1.7で固定。上限超えは除外され、検索にも表示されます。",
                        "안전 모드는 버전을 1.7로 고정하며, 초과 항목은 제외되고 검색에도 안내됩니다.",
                        "Le mode sûr bloque la version à 1.7 ; les entrées plus récentes sont filtrées et la recherche prévient."
                    ),
                },
            ],
            note: L(
                "安全模式 · 桌面端",
                "安全模式 · 桌面端",
                "Safe mode · desktop",
                "セーフモード · デスクトップ",
                "안전 모드 · 데스크톱",
                "Mode sûr · bureau"
            ),
        },
        {
            id: "map",
            chapter: L("本地地图", "本地地圖", "Local map", "ローカルマップ", "로컬 지도", "Carte locale"),
            duration: 11,
            shot: {
                type: "map",
                region: L("世界地图", "世界地圖", "World Map", "ワールドマップ", "세계 지도", "Carte du monde"),
                layers: [
                    { label: L("基础图层", "基礎圖層", "Base layers", "基本レイヤー", "기본 레이어", "Calques de base"), on: true },
                    { label: L("楼层图层", "樓層圖層", "Floor layers", "フロアレイヤー", "층 레이어", "Calques d'étage"), on: true },
                    {
                        label: L(
                            "子区域图层",
                            "子區域圖層",
                            "Sub-area layers",
                            "サブエリアレイヤー",
                            "하위 지역 레이어",
                            "Calques de sous-zone"
                        ),
                        on: true,
                    },
                    { label: L("其它图层", "其它圖層", "Other layers", "その他レイヤー", "기타 레이어", "Autres calques"), on: false },
                ],
                points: [
                    { x: 18, y: 32, kind: "tp", label: L("传送点", "傳送點", "Teleport", "転送点", "전송점", "Téléport"), at: 0.4 },
                    { x: 34, y: 46, kind: "pet", label: L("魔灵", "魔靈", "Pet", "魔霊", "마령", "Familier"), at: 0.7 },
                    { x: 55, y: 38, kind: "resource", label: L("资源", "資源", "Resource", "資源", "자원", "Ressource"), at: 0.9 },
                    { x: 68, y: 62, kind: "pet", label: L("魔灵", "魔靈", "Pet", "魔霊", "마령", "Familier"), at: 1.1 },
                    { x: 82, y: 28, kind: "tp", label: L("传送点", "傳送點", "Teleport", "転送点", "전송점", "Téléport"), at: 1.3 },
                ],
                path: [
                    { x1: 18, y1: 32, x2: 34, y2: 46, kind: "walk" },
                    { x1: 34, y1: 46, x2: 55, y2: 38, kind: "walk" },
                    { x1: 55, y1: 38, x2: 68, y2: 62, kind: "walk" },
                    { x1: 68, y1: 62, x2: 82, y2: 28, kind: "teleport" },
                ],
                showPathAt: 3.0,
                hover: [55, 38],
                coordinate: "X 1240 · Y -860",
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "只有配置 mapMapping 的区域可选；图层面板叠加基础、楼层、子区域图层。",
                        "只有配置 mapMapping 的區域可選；圖層面板疊加基礎、樓層、子區域圖層。",
                        "Only regions with mapMapping appear; the layer panel stacks base, floor, and sub-area layers.",
                        "mapMapping がある地域のみ選択可。レイヤーで基本・フロア・サブエリアを重ねます。",
                        "mapMapping이 있는 지역만 선택됩니다. 레이어 패널에서 기본, 층, 하위 지역을 겹칩니다.",
                        "Seules les régions avec mapMapping apparaissent ; les calques empilent base, étages et sous-zones."
                    ),
                },
                {
                    at: 5.6,
                    text: L(
                        "最短图遍历：黄步行、青虚线传送、红不可达；坐标可生成深链。",
                        "最短路徑遍歷：黃步行、青虛線傳送、紅不可達；座標可生成深鏈。",
                        "Shortest traversal: yellow walks, cyan dashed teleports, red unreachable; coordinates make deep links.",
                        "最短巡回：黄は徒歩、青破線は転送、赤は到達不可。座標は深いリンクに。",
                        "최단 경로: 노랑 도보, 청록 점선 전송, 빨강 도달 불가. 좌표는 딥링크가 됩니다.",
                        "Parcours optimal : jaune à pied, cyan pointillé en téléportation, rouge inaccessible ; les coordonnées forment des liens profonds."
                    ),
                },
            ],
            callouts: [
                {
                    at: 2.2,
                    text: L(
                        "图层 · 魔灵概率 · 传送点 · 资源",
                        "圖層 · 魔靈機率 · 傳送點 · 資源",
                        "Layers · pet odds · teleports · resources",
                        "レイヤー・魔霊確率・転送点・資源",
                        "레이어 · 마령 확률 · 전송점 · 자원",
                        "Calques · chances · téléports · ressources"
                    ),
                    x: 82,
                    y: 46,
                },
                {
                    at: 7.6,
                    text: L(
                        "在线地图 /db/map：Web 缓存，标记存本地 Dexie",
                        "線上地圖 /db/map：Web 快取，標記存本地 Dexie",
                        "Online map /db/map: web cache, markers in local Dexie",
                        "オンラインマップ /db/map：Web はキャッシュ、マーカーはローカル Dexie",
                        "온라인 지도 /db/map: Web 캐시, 마커는 로컬 Dexie",
                        "Carte en ligne /db/map : cache web, marqueurs dans Dexie local"
                    ),
                    x: 52,
                    y: 86,
                },
            ],
            note: L(
                "在线地图：Web 走缓存 · 桌面端在线",
                "線上地圖：Web 走快取 · 桌面端線上",
                "Online map: web cache · desktop online",
                "オンライン地図：Web はキャッシュ・デスクトップはオンライン",
                "온라인 지도: Web 캐시 · 데스크톱 온라인",
                "Carte en ligne : cache web · bureau en ligne"
            ),
        },
        {
            id: "recap",
            chapter: L("回顾", "回顧", "Recap", "まとめ", "정리", "Récapitulatif"),
            duration: 8,
            shot: {
                type: "recap",
                title: L(
                    "从资料到坐标",
                    "從資料到座標",
                    "From entry to coordinate",
                    "データから座標へ",
                    "데이터에서 좌표로",
                    "De la fiche aux coordonnées"
                ),
                checklist: [
                    L(
                        "35 个模块，五区总览",
                        "35 個模組，五區總覽",
                        "35 modules across five sections",
                        "35モジュール・5セクション",
                        "35개 모듈, 다섯 구역",
                        "35 modules, cinq sections"
                    ),
                    L(
                        "名称、拼音、别名、数字 ID 都能搜",
                        "名稱、拼音、別名、數字 ID 都能搜",
                        "Name, pinyin, alias, and numeric ID all search",
                        "名前・ピンイン・別名・数字 ID で検索",
                        "이름, 병음, 별칭, 숫자 ID 검색",
                        "Nom, pinyin, alias et ID numérique"
                    ),
                    L(
                        "在线地图：Web 走缓存，桌面端可在线",
                        "線上地圖：Web 走快取，桌面端可線上",
                        "Online map: web cache, desktop online",
                        "オンライン地図：Web はキャッシュ、デスクトップはオンライン",
                        "온라인 지도: Web 캐시, 데스크톱 온라인",
                        "Carte en ligne : cache web, bureau en ligne"
                    ),
                ],
                route: "/db",
                routeLabel: L("打开资料库", "開啟資料庫", "Open Database", "データベースを開く", "데이터베이스 열기", "Ouvrir la base"),
                hint: L(
                    "下一集：把构筑做成节点图",
                    "下一集：把構築做成節點圖",
                    "Next: turn a build into a node graph",
                    "次回：構築をノード図に",
                    "다음: 빌드를 노드 그래프로",
                    "Ensuite : transformer un build en graphe de nœuds"
                ),
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "先去资料库查清楚，再去地图上找坐标。",
                        "先去資料庫查清楚，再去地圖上找座標。",
                        "Look it up in the database first, then find the coordinate on the map.",
                        "まずデータベースで調べ、次に地図で座標を探します。",
                        "먼저 데이터베이스에서 확인하고, 그다음 지도에서 좌표를 찾으세요.",
                        "Cherchez d'abord dans la base, puis trouvez la coordonnée sur la carte."
                    ),
                },
            ],
        },
    ],
}
