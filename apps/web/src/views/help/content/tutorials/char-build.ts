import { L, type Tutorial } from "../types"

const charName = L("赛琪", "賽琪", "Saiqi", "サイキ", "사이치", "Saiqi")
const wind = L("风", "風", "Wind", "風", "바람", "Vent")
const melee = L("塞壬的拥吻", "塞壬的擁吻", "Siren's Kiss", "セイレーンの口づけ", "세이렌의 입맞춤", "Baiser de Sirène")

export const charBuildTutorial: Tutorial = {
    id: "char-build",
    number: "02",
    category: "build",
    title: L("角色构筑", "角色構築", "Character Build", "キャラクター構築", "캐릭터 빌드", "Construction de personnage"),
    subtitle: L(
        "先看结果，再改参数",
        "先看結果，再改參數",
        "See the result first, then tune it",
        "まず結果を見て、それから調整",
        "결과를 먼저 보고, 그다음 조정",
        "Voir le résultat, puis ajuster"
    ),
    summary: L(
        "从角色列表进入构筑，分清简洁模式与专业模式；换武器、装魔之楔、写目标函数、把技能字段拖进自定义变量，最后保存与分享。",
        "從角色列表進入構築，分清簡潔模式與專業模式；換武器、裝魔之楔、寫目標函數、把技能欄位拖進自訂變數，最後儲存與分享。",
        "Enter from the character list, tell simple and pro modes apart, swap weapons, socket mods, write a target function, drag skill fields into custom variables, then save and share.",
        "キャラ一覧から構築へ。シンプル／プロモードの違い、武器交換、魔之楔、目標関数、スキル項目のカスタム変数へのドラッグ、保存と共有まで。",
        "캐릭터 목록에서 빌드로 들어가 간단/전문 모드를 구분하고, 무기 교체, 모드 장착, 목표 함수 작성, 스킬 필드를 사용자 변수로 드래그, 저장과 공유까지 익힙니다.",
        "Entrez depuis la liste des personnages, distinguez les modes simple et pro, changez d'arme, installez des mods, écrivez une fonction cible, glissez des champs de compétence dans des variables personnalisées, puis sauvegardez et partagez."
    ),
    icon: "ri:hammer-line",
    accent: "#f5576c",
    route: "/char",
    routeLabel: L("打开角色构筑", "開啟角色構築", "Open Character Build", "キャラ構築を開く", "캐릭터 빌드 열기", "Ouvrir la construction"),
    platforms: ["web"],
    scenes: [
        {
            id: "intro",
            chapter: L("开场", "開場", "Intro", "導入", "인트로", "Intro"),
            duration: 5,
            shot: {
                type: "title",
                variant: "intro",
                kicker: L("EP 02 · 构筑", "EP 02 · 構築", "EP 02 · BUILD", "EP 02 · 構築", "EP 02 · 빌드", "EP 02 · BUILD"),
                title: L("角色构筑", "角色構築", "Character Build", "キャラクター構築", "캐릭터 빌드", "Construction de personnage"),
                subtitle: L(
                    "从一个角色开始，把伤害算清楚。",
                    "從一個角色開始，把傷害算清楚。",
                    "Start with one character, and make the damage legible.",
                    "一人のキャラから、ダメージを読み解く。",
                    "한 캐릭터에서 시작해 피해를 명확하게.",
                    "Partez d'un personnage et rendez les dégâts lisibles."
                ),
                icon: "ri:hammer-line",
                index: "02",
            },
            captions: [
                {
                    at: 0.9,
                    text: L(
                        "默认进入简洁模式：先看结果，再决定怎么改。",
                        "預設進入簡潔模式：先看結果，再決定怎麼改。",
                        "You land in simple mode: read the result before changing anything.",
                        "最初はシンプルモード。結果を見てから変更します。",
                        "기본은 간단 모드입니다. 결과를 먼저 확인하세요.",
                        "Le mode simple s'ouvre par défaut : lisez le résultat avant de modifier."
                    ),
                },
            ],
        },
        {
            id: "two-modes",
            chapter: L("两种模式", "兩種模式", "Two modes", "2つのモード", "두 가지 모드", "Deux modes"),
            duration: 9,
            shot: {
                type: "steps",
                kicker: L("READ vs EDIT", "READ vs EDIT", "READ vs EDIT", "READ vs EDIT", "READ vs EDIT", "LIRE vs ÉDITER"),
                title: L(
                    "先看结果，再调参数",
                    "先看結果，再調參數",
                    "Read first, edit second",
                    "まず読む、次に編集",
                    "먼저 읽고, 그다음 편집",
                    "Lire d'abord, éditer ensuite"
                ),
                steps: [
                    {
                        icon: "ri:eye-line",
                        title: L("简洁模式", "簡潔模式", "Simple mode", "シンプルモード", "간단 모드", "Mode simple"),
                        desc: L(
                            "只读 HUD：装配总览、核心属性、大数字伤害。",
                            "唯讀 HUD：裝配總覽、核心屬性、大數字傷害。",
                            "Read-only HUD: loadout, core stats, one big damage number.",
                            "読み取り専用 HUD：装備、主要属性、大きなダメージ数値。",
                            "읽기 전용 HUD: 장비, 핵심 속성, 큰 피해 수치.",
                            "HUD en lecture seule : équipement, stats clés, gros chiffre."
                        ),
                    },
                    {
                        icon: "ri:settings-3-line",
                        title: L("专业模式", "專業模式", "Pro mode", "プロモード", "전문 모드", "Mode pro"),
                        desc: L(
                            "左栏角色/武器与目标函数，右侧编号正文分区。",
                            "左欄角色/武器與目標函數，右側編號正文分區。",
                            "Left rail for character, weapons, and target function; numbered sections on the right.",
                            "左にキャラ・武器・目標関数、右に番号付きセクション。",
                            "왼쪽에 캐릭터/무기와 목표 함수, 오른쪽에 번호 섹션.",
                            "Rail gauche : personnage, armes et fonction cible ; sections numérotées à droite."
                        ),
                    },
                    {
                        icon: "ri:refresh-line",
                        title: L("实时重算", "即時重算", "Live recalc", "リアルタイム再計算", "실시간 재계산", "Recalcul en direct"),
                        desc: L(
                            "每次改动立即进入目标函数，结果同步变化。",
                            "每次改動立即進入目標函數，結果同步變化。",
                            "Every change flows into the target function and the result updates.",
                            "変更は目標関数へ即反映され、結果が同期します。",
                            "변경 사항이 목표 함수에 즉시 반영됩니다.",
                            "Chaque changement passe dans la fonction cible et le résultat suit."
                        ),
                    },
                    {
                        icon: "ri:save-line",
                        title: L("保存与分享", "儲存與分享", "Save & share", "保存と共有", "저장과 공유", "Sauver et partager"),
                        desc: L(
                            "当前配置自动持久化；命名项目做快照，分享生成链接。",
                            "目前設定自動持久化；命名專案做快照，分享產生連結。",
                            "Current settings persist automatically; named projects snapshot them, sharing makes a link.",
                            "現在の設定は自動保存。名前付きプロジェクトはスナップショット、共有はリンクを生成。",
                            "현재 설정은 자동 저장됩니다. 이름 있는 프로젝트는 스냅샷, 공유는 링크 생성.",
                            "Les réglages persistent ; les projets nommés font un instantané, le partage crée un lien."
                        ),
                    },
                ],
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "同一个构筑，两种视角：简洁模式负责看懂，专业模式负责改。",
                        "同一個構築，兩種視角：簡潔模式負責看懂，專業模式負責改。",
                        "One build, two views: simple mode is for reading, pro mode is for editing.",
                        "同じ構築を2つの視点で。シンプルは理解、プロは編集。",
                        "하나의 빌드를 두 시점으로: 간단 모드는 이해, 전문 모드는 편집.",
                        "Une construction, deux vues : le simple pour lire, le pro pour éditer."
                    ),
                },
                {
                    at: 5.4,
                    text: L(
                        "先记住这条分界，后面所有操作都从专业模式开始。",
                        "先記住這條分界，後面所有操作都從專業模式開始。",
                        "Remember the boundary: every edit below starts in pro mode.",
                        "この境界を覚えて。以下の編集はすべてプロモードから。",
                        "이 경계를 기억하세요. 아래 편집은 모두 전문 모드에서 시작합니다.",
                        "Retenez la frontière : toutes les modifications se font en mode pro."
                    ),
                },
            ],
        },
        {
            id: "roster",
            chapter: L("选角色", "選角色", "Pick a character", "キャラ選択", "캐릭터 선택", "Choisir un personnage"),
            duration: 9,
            shot: {
                type: "cards",
                kicker: "ROSTER",
                title: L(
                    "从角色列表进入",
                    "從角色列表進入",
                    "Enter from the roster",
                    "キャラ一覧から入る",
                    "캐릭터 목록에서 시작",
                    "Entrer par la liste"
                ),
                toolbar: {
                    search: L("saiqi", "saiqi", "saiqi", "saiqi", "saiqi", "saiqi"),
                    tabs: [
                        L("全部", "全部", "All", "すべて", "전체", "Tous"),
                        L("输出", "輸出", "DPS", "アタッカー", "딜러", "DPS"),
                        L("辅助", "輔助", "Support", "サポート", "서포터", "Soutien"),
                        L("同律", "同律", "Resonance", "同律", "동률", "Résonance"),
                    ],
                    activeTab: 0,
                    actions: [L("拼音搜索", "拼音搜尋", "Pinyin", "ピンイン", "병음", "Pinyin")],
                },
                items: [
                    {
                        title: charName,
                        subtitle: L(
                            "茧的白昼梦",
                            "繭的白晝夢",
                            "Daydream of the Cocoon",
                            "繭の白昼夢",
                            "고치의 백일몽",
                            "Rêve diurne du cocon"
                        ),
                        icon: "ri:user-line",
                        tag: wind,
                        meta: "5301",
                        accent: "#7dd3fc",
                    },
                    {
                        title: L("黎瑟", "黎瑟", "Lise", "リーゼ", "리제", "Lise"),
                        subtitle: L("到灯塔去", "到燈塔去", "To the Lighthouse", "灯台へ", "등대로", "Vers le phare"),
                        icon: "ri:user-line",
                        tag: L("雷", "雷", "Lightning", "雷", "번개", "Foudre"),
                        meta: "4101",
                        accent: "#c084fc",
                    },
                    {
                        title: L("贝蕾妮卡", "貝蕾妮卡", "Berenica", "ベレニカ", "베레니카", "Berenica"),
                        subtitle: L("冒险家", "冒險家", "Adventurer", "冒険家", "모험가", "Aventurière"),
                        icon: "ri:user-line",
                        tag: L("光", "光", "Light", "光", "빛", "Lumière"),
                        meta: "1101",
                        accent: "#fbbf24",
                    },
                    {
                        title: L("达芙涅", "達芙涅", "Daphne", "ダフネ", "다프네", "Daphné"),
                        subtitle: L("水之誓约", "水之誓約", "Oath of Water", "水の誓約", "물의 서약", "Serment d'eau"),
                        icon: "ri:user-line",
                        tag: L("水", "水", "Water", "水", "물", "Eau"),
                        meta: "3101",
                        accent: "#38bdf8",
                    },
                    {
                        title: L("芙罗拉", "芙羅拉", "Flora", "フローラ", "플로라", "Flora"),
                        subtitle: L("反逆花序", "反逆花序", "Rebel Inflorescence", "反逆花序", "반역 화서", "Inflorescence rebelle"),
                        icon: "ri:user-line",
                        tag: L("暗", "暗", "Dark", "闇", "어둠", "Ténèbres"),
                        meta: "1102",
                        accent: "#a78bfa",
                    },
                    {
                        title: L("卡嘉", "卡嘉", "Kaja", "カジャ", "카자", "Kaja"),
                        subtitle: L(
                            "神弃者同盟",
                            "神棄者同盟",
                            "Godforsaken Alliance",
                            "神棄者の同盟",
                            "신기버림 동맹",
                            "Alliance des abandonnés"
                        ),
                        icon: "ri:shield-line",
                        tag: L("火", "火", "Fire", "火", "불", "Feu"),
                        meta: "3203",
                        accent: "#fb7185",
                    },
                ],
                columns: 3,
                highlight: 0,
                highlightAt: 2.1,
                highlightLabel: L("已选择", "已選擇", "Selected", "選択済み", "선택됨", "Sélectionné"),
                footnote: L(
                    "支持名称 / 拼音 / 别名 / ID",
                    "支援名稱 / 拼音 / 別名 / ID",
                    "Name, pinyin, alias, or ID",
                    "名前・ピンイン・別名・ID",
                    "이름/병음/별칭/ID",
                    "Nom, pinyin, alias ou ID"
                ),
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "角色列表支持名称、拼音、别名和 ID；输入 saiqi 就能过滤。",
                        "角色列表支援名稱、拼音、別名和 ID；輸入 saiqi 就能篩選。",
                        "The roster matches name, pinyin, alias, and ID. Type saiqi to filter.",
                        "名前・ピンイン・別名・ID に対応。saiqi で絞り込めます。",
                        "이름, 병음, 별칭, ID를 지원합니다. saiqi를 입력하세요.",
                        "La liste accepte nom, pinyin, alias et ID. Tapez saiqi."
                    ),
                },
                {
                    at: 5.2,
                    text: L(
                        "点卡片进入构筑；右上角搜索和分类可以叠加使用。",
                        "點卡片進入構築；右上角搜尋和分類可以疊加使用。",
                        "Click a card to open the build. Search and category filters combine.",
                        "カードをクリックで構築へ。検索と分類は併用できます。",
                        "카드를 클릭하면 빌드로 이동합니다. 검색과 분류는 함께 사용됩니다.",
                        "Cliquez sur une carte pour ouvrir la construction. Recherche et filtres se combinent."
                    ),
                },
            ],
            callouts: [
                {
                    at: 3.4,
                    text: L(
                        "点击卡片进入构筑",
                        "點擊卡片進入構築",
                        "Click a card to open the build",
                        "カードをクリック",
                        "카드 클릭",
                        "Cliquez sur une carte"
                    ),
                    x: 34,
                    y: 58,
                },
            ],
            cursor: {
                at: 1.2,
                path: [
                    [42, 22],
                    [38, 36],
                    [34, 52],
                    [34, 58],
                ],
                clickAt: 2.1,
            },
        },
        {
            id: "simple-hud",
            chapter: L("简洁模式", "簡潔模式", "Simple mode", "シンプルモード", "간단 모드", "Mode simple"),
            duration: 10,
            shot: {
                type: "build",
                mode: "simple",
                character: charName,
                element: wind,
                level: "Lv.80",
                weapon: melee,
                damage: "1,284,900",
                tolerance: [38, 60],
                mods: [
                    { name: L("攻势", "攻勢", "Offensive", "攻勢", "공세", "Offensive"), level: 10, accent: true },
                    { name: L("专注", "專注", "Focus", "集中", "집중", "Focus"), level: 10 },
                    { name: L("盛怒", "盛怒", "Wrath", "盛怒", "격노", "Courroux"), level: 10 },
                    { name: L("锋锐", "鋒銳", "Keen", "鋭鋒", "예리", "Tranchant"), level: 10 },
                    { name: L("透析", "透析", "Analysis", "透析", "투석", "Analyse"), level: 10 },
                    { name: L("重压", "重壓", "Pressure", "重圧", "중압", "Pression"), level: 10 },
                ],
                stats: [
                    { label: L("攻击", "攻擊", "ATK", "攻撃", "공격", "ATQ"), value: "1,286" },
                    { label: L("暴击率", "暴擊率", "CRIT RATE", "会心率", "치명타율", "TAUX CRIT"), value: "62.4%" },
                    { label: L("暴击伤害", "暴擊傷害", "CRIT DMG", "会心ダメージ", "치명타 피해", "DÉGÂTS CRIT"), value: "218%" },
                    { label: L("增伤", "增傷", "DMG BONUS", "ダメ増加", "피해 증가", "BONUS DGT"), value: "+86.2%" },
                ],
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "简洁模式是一块只读 HUD：角色、武器、魔之楔、伤害一屏看完。",
                        "簡潔模式是一塊唯讀 HUD：角色、武器、魔之楔、傷害一屏看完。",
                        "Simple mode is a read-only HUD: character, weapon, mods, and damage on one screen.",
                        "シンプルモードは読み取り専用 HUD。キャラ、武器、魔之楔、ダメージを一画面で。",
                        "간단 모드는 읽기 전용 HUD입니다. 캐릭터, 무기, 모드, 피해를 한 화면에.",
                        "Le mode simple est un HUD en lecture seule : personnage, arme, mods et dégâts."
                    ),
                },
                {
                    at: 5.4,
                    text: L(
                        "底部的大数字就是目标函数结果；要改它，切到专业模式。",
                        "底部的大數字就是目標函數結果；要改它，切到專業模式。",
                        "The big number is the target function result. To change it, switch to pro mode.",
                        "下部の大きな数字が目標関数の結果。変更するにはプロモードへ。",
                        "하단의 큰 숫자가 목표 함수 결과입니다. 바꾸려면 전문 모드로.",
                        "Le grand chiffre est le résultat de la fonction cible. Passez en mode pro pour le changer."
                    ),
                },
            ],
            callouts: [
                { at: 2.6, text: L("装配总览", "裝配總覽", "Loadout overview", "装備概要", "장비 개요", "Vue d'ensemble"), x: 68, y: 24 },
                {
                    at: 6.6,
                    text: L("目标函数结果", "目標函數結果", "Target result", "目標関数の結果", "목표 함수 결과", "Résultat cible"),
                    x: 50,
                    y: 76,
                },
            ],
            note: L("只读", "唯讀", "Read-only", "読み取り専用", "읽기 전용", "Lecture seule"),
        },
        {
            id: "pro-editor",
            chapter: L("专业模式", "專業模式", "Pro mode", "プロモード", "전문 모드", "Mode pro"),
            duration: 10.5,
            shot: {
                type: "build",
                mode: "pro",
                character: charName,
                element: wind,
                level: "Lv.80",
                expression: "伤害",
                damage: "1,284,900",
                activeVariant: "A",
                tolerance: [42, 60],
                mods: [
                    { name: L("攻势", "攻勢", "Offensive", "攻勢", "공세", "Offensive"), level: 10, accent: true },
                    { name: L("专注", "專注", "Focus", "集中", "집중", "Focus"), level: 10 },
                    { name: L("盛怒", "盛怒", "Wrath", "盛怒", "격노", "Courroux"), level: 10 },
                    { name: L("锋锐", "鋒銳", "Keen", "鋭鋒", "예리", "Tranchant"), level: 10 },
                    { name: L("透析", "透析", "Analysis", "透析", "투석", "Analyse"), level: 10 },
                    { name: L("重压", "重壓", "Pressure", "重圧", "중압", "Pression"), level: 10 },
                    { name: L("坚守", "堅守", "Guard", "堅守", "수호", "Garde"), level: 10 },
                    { name: L("羽翼", "羽翼", "Wings", "羽翼", "날개", "Ailes"), level: 10 },
                ],
                stats: [
                    { label: L("攻击", "攻擊", "ATK", "攻撃", "공격", "ATQ"), value: "1,286" },
                    { label: L("暴击率", "暴擊率", "CRIT RATE", "会心率", "치명타율", "TAUX CRIT"), value: "62.4%" },
                    { label: L("暴击伤害", "暴擊傷害", "CRIT DMG", "会心ダメージ", "치명타 피해", "DÉGÂTS CRIT"), value: "218%" },
                    { label: L("增伤", "增傷", "DMG BONUS", "ダメ増加", "피해 증가", "BONUS DGT"), value: "+86.2%" },
                ],
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "专业模式是左栏 + 正文：左栏切换角色/武器并写目标函数，右侧按 01–09 分区装魔之楔、BUFF。",
                        "專業模式是左欄 + 正文：左欄切換角色/武器並寫目標函數，右側按 01–09 分區裝魔之楔、BUFF。",
                        "Pro mode is a left rail plus a main column: switch character/weapons and edit the target function on the left; numbered sections 01–09 on the right hold mods and buffs.",
                        "プロモードは左レール＋本文。左でキャラ/武器を切り替え、目標関数を編集。右は 01–09 のセクションで魔之楔や BUFF を設定。",
                        "전문 모드는 왼쪽 레일 + 본문입니다. 왼쪽에서 캐릭터/무기를 바꾸고 목표 함수를 쓰며, 오른쪽 01–09 섹션에서 모드와 BUFF를 설정합니다.",
                        "Le mode pro est un rail gauche + une colonne principale : personnage/armes et fonction cible à gauche, sections 01–09 à droite pour les mods et BUFF."
                    ),
                },
                {
                    at: 5.8,
                    text: L(
                        "属性行、技能字段、DOT 行都能拖进目标函数；非法表达式会红字提示且不更新结果。",
                        "屬性列、技能欄位、DOT 列都能拖進目標函數；非法表達式會紅字提示且不更新結果。",
                        "Drag attribute rows, skill fields, or DOT rows into the target function. Invalid expressions show an error and keep the last valid result.",
                        "属性行・スキル項目・DOT 行を目標関数へドラッグ。不正な式は赤く表示され、結果は更新されません。",
                        "속성 행, 스킬 필드, DOT 행을 목표 함수로 드래그하세요. 잘못된 식은 오류를 표시하고 결과를 갱신하지 않습니다.",
                        "Glissez les lignes d'attribut, de compétence ou de DOT dans la fonction cible. Une expression invalide affiche une erreur et conserve l'ancien résultat."
                    ),
                },
            ],
            callouts: [
                {
                    at: 3.2,
                    text: L(
                        "武器、技能、属性都能选",
                        "武器、技能、屬性都能選",
                        "Weapon, skill, attributes",
                        "武器・スキル・属性",
                        "무기/스킬/속성",
                        "Arme, compétence, stats"
                    ),
                    x: 24,
                    y: 35,
                },
                {
                    at: 7.4,
                    text: L(
                        "拖拽字段插入表达式",
                        "拖曳欄位插入表達式",
                        "Drag fields into the expression",
                        "項目をドラッグして挿入",
                        "필드를 드래그해 삽입",
                        "Glissez les champs"
                    ),
                    x: 32,
                    y: 64,
                },
            ],
            focus: {
                at: 5.2,
                x: 7,
                y: 55,
                w: 26,
                h: 18,
                label: L("目标函数", "目標函數", "TARGET FUNCTION", "目標関数", "목표 함수", "FONCTION CIBLE"),
            },
            cursor: {
                at: 3.0,
                path: [
                    [22, 35],
                    [25, 50],
                    [29, 60],
                ],
                clickAt: 5.0,
            },
        },
        {
            id: "mods",
            chapter: L("魔之楔", "魔之楔", "Mods", "魔之楔", "모드", "Mods"),
            duration: 10.5,
            shot: {
                type: "build",
                mode: "mods",
                character: charName,
                element: wind,
                activeVariant: "A",
                tolerance: [48, 60],
                mods: [
                    { name: L("攻势", "攻勢", "Offensive", "攻勢", "공세", "Offensive"), level: 10, accent: true },
                    { name: L("专注", "專注", "Focus", "集中", "집중", "Focus"), level: 10 },
                    { name: L("盛怒", "盛怒", "Wrath", "盛怒", "격노", "Courroux"), level: 10 },
                    { name: L("锋锐", "鋒銳", "Keen", "鋭鋒", "예리", "Tranchant"), level: 10 },
                    { name: L("透析", "透析", "Analysis", "透析", "투석", "Analyse"), level: 10 },
                    { name: L("重压", "重壓", "Pressure", "重圧", "중압", "Pression"), level: 10 },
                    { name: L("坚守", "堅守", "Guard", "堅守", "수호", "Garde"), level: 10 },
                    { name: L("羽翼", "羽翼", "Wings", "羽翼", "날개", "Ailes"), level: 10 },
                ],
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "魔之楔按角色、近战、远程分开，每类 8 格；标题里的数字是当前负荷与耐受上限。",
                        "魔之楔按角色、近戰、遠程分開，每類 8 格；標題裡的數字是目前負荷與耐受上限。",
                        "Mods are split by character, melee, and ranged, eight slots each. The header shows current load and tolerance cap.",
                        "魔之楔はキャラ・近接・遠隔で分かれ、各8枠。見出しは現在負荷と耐性上限。",
                        "모드는 캐릭터/근접/원거리로 나뉘며 각 8칸입니다. 제목은 현재 부하와 내성 상한입니다.",
                        "Les mods se répartissent par personnage, mêlée et distance, huit emplacements chacun. L'en-tête montre la charge et la limite."
                    ),
                },
                {
                    at: 5.6,
                    text: L(
                        "A/B/C 三套变体。自动计算需要用的移转模块数量；复制社区代码可以直接粘进游戏。",
                        "A/B/C 三套變體。自動計算需要用的移轉模組數量；複製社群代碼可以直接貼進遊戲。",
                        "Three variants, A/B/C. It automatically calculates how many transfer modules you need. Copy the community code straight into the game.",
                        "A/B/C の3変種。必要な転送モジュール数を自動計算。コミュニティコードはゲームに貼れます。",
                        "A/B/C 세 가지 변형. 필요한 전이 모듈 수를 자동으로 계산합니다. 커뮤니티 코드를 게임에 붙여넣을 수 있습니다.",
                        "Trois variantes A/B/C. Le nombre de modules de transfert nécessaires est calculé automatiquement. Le code communautaire se colle dans le jeu."
                    ),
                },
            ],
            callouts: [
                {
                    at: 3.0,
                    text: L("负荷 / 耐受", "負荷 / 耐受", "Load / tolerance", "負荷 / 耐性", "부하 / 내성", "Charge / tolérance"),
                    x: 54,
                    y: 28,
                },
                {
                    at: 7.6,
                    text: L(
                        "复制社区代码",
                        "複製社群代碼",
                        "Copy community code",
                        "コミュニティコード",
                        "커뮤니티 코드 복사",
                        "Copier le code"
                    ),
                    x: 78,
                    y: 82,
                },
            ],
            cursor: {
                at: 3.4,
                path: [
                    [65, 20],
                    [76, 30],
                    [80, 52],
                ],
                clickAt: 5.0,
            },
        },
        {
            id: "target",
            chapter: L("目标函数", "目標函數", "Target function", "目標関数", "목표 함수", "Fonction cible"),
            duration: 10.5,
            shot: {
                type: "build",
                mode: "target",
                character: charName,
                element: wind,
                expression: "DPS",
                damage: "18,420",
                ast: ["or(攻速, 技能速度)", "or(多重, 1)", "伤害", "DPS = 上三者的乘积", "→ 每秒伤害"],
                stats: [
                    { label: L("攻速", "攻速", "Attack speed", "攻撃速度", "공격 속도", "Vitesse"), value: "2.4" },
                    { label: L("多重", "多重", "Multi-hit", "多重", "다중", "Multi-coup"), value: "1.8" },
                    { label: L("单次伤害", "單次傷害", "Hit damage", "単発ダメージ", "단일 피해", "Dégâts par coup"), value: "4,260" },
                    { label: L("暴击期望", "暴擊期望", "Crit expected", "会心期待値", "치명타 기대", "Crit attendu"), value: "1.86×" },
                ],
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "目标函数不是固定模板，而是一门可组合的表达式语言。",
                        "目標函數不是固定模板，而是一門可組合的表達式語言。",
                        "The target function is not a fixed template; it is a composable expression language.",
                        "目標関数は固定テンプレートではなく、組み合わせ可能な式言語です。",
                        "목표 함수는 고정 템플릿이 아니라 조합 가능한 표현식 언어입니다.",
                        "La fonction cible n'est pas un modèle figé, mais un langage d'expressions composable."
                    ),
                },
                {
                    at: 5.6,
                    text: L(
                        "内置 DPS、总伤、每神智 DPH 等宏；也可以定义变量和函数。",
                        "內建 DPS、總傷、每神智 DPH 等宏；也可以定義變數和函數。",
                        "Built-in macros include DPS, total damage, and DPH. You can also define variables and functions.",
                        "DPS・総ダメージ・神智あたりDPH などのマクロ内蔵。変数や関数も定義できます。",
                        "DPS, 총 피해, 신지당 DPH 등 내장 매크로가 있으며 변수와 함수도 정의할 수 있습니다.",
                        "Des macros DPS, dégâts totaux et DPH sont intégrées. Vous pouvez aussi définir variables et fonctions."
                    ),
                },
            ],
            callouts: [
                {
                    at: 3.2,
                    text: L(
                        "AST 帮助可点击插入",
                        "AST 說明可點擊插入",
                        "Click-to-insert AST help",
                        "AST ヘルプから挿入",
                        "AST 도움말에서 삽입",
                        "Aide AST à cliquer"
                    ),
                    x: 26,
                    y: 58,
                },
                {
                    at: 7.8,
                    text: L(
                        "合法才更新结果",
                        "合法才更新結果",
                        "Only valid AST updates",
                        "有効な時だけ更新",
                        "유효할 때만 갱신",
                        "Mise à jour si valide"
                    ),
                    x: 68,
                    y: 60,
                },
            ],
            focus: {
                at: 2.0,
                x: 7,
                y: 17,
                w: 52,
                h: 68,
                label: L("表达式 + AST", "表達式 + AST", "EXPRESSION + AST", "式 + AST", "표현식 + AST", "EXPRESSION + AST"),
            },
        },
        {
            id: "field-drag",
            chapter: L("字段拖拽", "欄位拖曳", "Drag fields", "項目ドラッグ", "필드 드래그", "Glisser un champ"),
            duration: 11,
            shot: {
                type: "build",
                mode: "drag",
                character: charName,
                element: wind,
                level: "Lv.80",
                skill: L("抽茧成梦", "抽繭成夢", "Cocoon Dream", "繭紡ぎの夢", "고치의 꿈", "Rêve de cocon"),
                expression: "x * 攻速",
                damage: "1,536,120",
                dragExpr: "抽茧成梦::[幻象]伤害",
                stats: [
                    {
                        label: L("[幻象]伤害", "[幻象]傷害", "[Phantasm] DMG", "[幻象]ダメージ", "[환영] 피해", "[Phantasm] DGT"),
                        value: "234%",
                    },
                    {
                        label: L(
                            "[浮光鳞粉]伤害",
                            "[浮光鱗粉]傷害",
                            "[Glimmer Pollen] DMG",
                            "[浮光鱗粉]ダメージ",
                            "[부광 인분] 피해",
                            "[Pollen chatoyant] DGT"
                        ),
                        value: "146%",
                    },
                    {
                        label: L(
                            "[鳞粉印记]触发伤害",
                            "[鱗粉印記]觸發傷害",
                            "[Scale Mark] Trigger DMG",
                            "[鱗粉印]発動ダメージ",
                            "[인분 각인] 발동 피해",
                            "[Marque d'écaille] DGT déclenchés"
                        ),
                        value: "42.4%",
                    },
                    {
                        label: L(
                            "[幻象]效果半径",
                            "[幻象]效果半徑",
                            "[Phantasm] Radius",
                            "[幻象]効果範囲",
                            "[환영] 효과 범위",
                            "[Phantasm] Rayon"
                        ),
                        value: "6m",
                    },
                    {
                        label: L(
                            "[抽茧成梦]神智消耗",
                            "[抽繭成夢]神智消耗",
                            "[Cocoon Dream] SAN cost",
                            "[繭紡ぎの夢]神智消費",
                            "[고치의 꿈] 신지 소모",
                            "[Rêve de cocon] Coût de santé mentale"
                        ),
                        value: "30",
                    },
                    {
                        label: L(
                            "[幻象]速度降低",
                            "[幻象]速度降低",
                            "[Phantasm] Slow",
                            "[幻象]速度低下",
                            "[환영] 속도 감소",
                            "[Phantasm] Ralentissement"
                        ),
                        value: "20%",
                    },
                ],
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "技能字段行本身就是表达式片段：按住「[幻象]伤害」，拖出来的是 `抽茧成梦::[幻象]伤害`。",
                        "技能欄位列本身就是表達式片段：按住「[幻象]傷害」，拖出來的是 `抽茧成梦::[幻象]伤害`。",
                        "Every skill-field row is already an expression fragment: press and drag [Phantasm] DMG to carry `抽茧成梦::[幻象]伤害`.",
                        "スキル項目の行はそのまま式の断片です。「[幻象]傷害」を押したままドラッグすると `抽茧成梦::[幻象]伤害` が付いてきます。",
                        "스킬 필드 행 자체가 표현식 조각입니다. 「[환영] 피해」를 누른 채 끌면 `抽茧成梦::[幻象]伤害`가 따라옵니다.",
                        "Chaque ligne de champ de compétence est déjà un fragment d'expression : maintenez [Phantasm] DGT pour emporter `抽茧成梦::[幻象]伤害`."
                    ),
                },
                {
                    at: 4.3,
                    text: L(
                        "松手放进自定义变量的表达式框；已有内容后会自动补 ` + `。触屏没有拖动：点一下字段，再点表达式框。",
                        "鬆手放進自訂變數的表達式框；已有內容後會自動補 ` + `。觸屏沒有拖曳：點一下欄位，再點表達式框。",
                        "Release it in a custom variable's expression field; an existing operand gets an automatic ` + `. On touch, tap the field, then tap the expression field.",
                        "カスタム変数の式欄で離すと、既存の内容の後ろに ` + ` が自動で入ります。タッチは項目をタップしてから式欄をタップ。",
                        "사용자 변수 표현식 칸에 놓으면 기존 내용 뒤에 ` + `가 자동으로 붙습니다. 터치에서는 필드를 탭한 뒤 표현식 칸을 탭하세요.",
                        "Déposez-le dans l'expression d'une variable : un ` + ` est ajouté automatiquement après un opérande. Sur tactile, touchez le champ puis l'expression."
                    ),
                },
                {
                    at: 7.4,
                    text: L(
                        "变量 x 能在目标函数里复用；双击任意字段可直接复制片段，粘到别处。",
                        "變數 x 能在目標函數裡複用；雙擊任意欄位可直接複製片段，貼到別處。",
                        "Variable x is reusable in the target function. Double-click any field to copy its fragment and paste it elsewhere.",
                        "変数 x は目標関数で再利用できます。任意の項目をダブルクリックすると断片をコピーできます。",
                        "변수 x는 목표 함수에서 재사용할 수 있습니다. 아무 필드나 더블클릭하면 조각이 복사됩니다.",
                        "La variable x est réutilisable dans la fonction cible. Double-cliquez un champ pour copier son fragment."
                    ),
                },
            ],
        },
        {
            id: "share",
            chapter: L("保存与分享", "儲存與分享", "Save & share", "保存と共有", "저장과 공유", "Sauver et partager"),
            duration: 8.5,
            shot: {
                type: "modal",
                title: L("分享构筑", "分享構築", "Share build", "構築を共有", "빌드 공유", "Partager la construction"),
                description: L(
                    "发布后会得到一条完整配置链接；打开链接即可载入这套构筑。",
                    "發布後會得到一條完整設定連結；開啟連結即可載入這套構築。",
                    "Publishing creates a full-configuration link. Opening it loads this exact build.",
                    "公開すると完全な設定リンクが発行され、開くとこの構築を読み込めます。",
                    "게시하면 전체 설정 링크가 생성되며, 열면 이 빌드를 불러옵니다.",
                    "La publication crée un lien complet ; l'ouvrir charge exactement cette construction."
                ),
                fields: [
                    {
                        label: L("标题", "標題", "Title", "タイトル", "제목", "Titre"),
                        value: L(
                            "赛琪 · 风伤 DPS",
                            "賽琪 · 風傷 DPS",
                            "Saiqi · Wind DPS",
                            "サイキ · 風 DPS",
                            "사이치 · 바람 DPS",
                            "Saiqi · DPS Vent"
                        ),
                    },
                    {
                        label: L("描述", "描述", "Description", "説明", "설명", "Description"),
                        value: L(
                            "目标函数 DPS，含魔之楔与协战",
                            "目標函數 DPS，含魔之楔與協戰",
                            "DPS target with mods and team buffs",
                            "目標関数 DPS、魔之楔と協戦込み",
                            "목표 함수 DPS, 모드와 협전 포함",
                            "Cible DPS avec mods et soutien"
                        ),
                    },
                ],
                actions: [
                    L("取消", "取消", "Cancel", "キャンセル", "취소", "Annuler"),
                    L("确认分享", "確認分享", "Publish", "共有する", "공유 확인", "Publier"),
                ],
                result: {
                    title: L(
                        "分享链接已复制",
                        "分享連結已複製",
                        "Share link copied",
                        "共有リンクをコピー",
                        "공유 링크 복사됨",
                        "Lien copié"
                    ),
                    value: "dna-builder.cn/char/5301/…",
                    hint: L(
                        "未登录会提示先登录社区账号",
                        "未登入會提示先登入社群帳號",
                        "You must be logged in to the community account",
                        "コミュニティへのログインが必要です",
                        "커뮤니티 로그인이 필요합니다",
                        "Connexion au compte communautaire requise"
                    ),
                },
                confirmAt: 1.6,
                resultAt: 2.8,
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "保存项目只是本地命名快照；分享会发布完整配置并复制链接。",
                        "儲存專案只是本地命名快照；分享會發布完整設定並複製連結。",
                        "Saving a project is a local named snapshot. Sharing publishes the full configuration and copies a link.",
                        "プロジェクト保存はローカルのスナップショット。共有は完全な設定を公開し、リンクをコピーします。",
                        "프로젝트 저장은 로컬 스냅샷입니다. 공유는 전체 설정을 게시하고 링크를 복사합니다.",
                        "Enregistrer un projet est un instantané local. Partager publie la configuration complète et copie un lien."
                    ),
                },
                {
                    at: 4.9,
                    text: L(
                        "社区代码只含魔之楔 id，不含等级；完整配置请用分享链接或 JSON。",
                        "社群代碼只含魔之楔 id，不含等級；完整設定請用分享連結或 JSON。",
                        "Community codes carry mod IDs only, not levels. Use a share link or JSON for the full build.",
                        "コミュニティコードは魔之楔 ID のみでレベルは含みません。完全な構築はリンクか JSON で。",
                        "커뮤니티 코드에는 모드 ID만 있고 레벨은 없습니다. 전체 빌드는 링크나 JSON을 사용하세요.",
                        "Les codes communautaires ne contiennent que les ID de mods, pas les niveaux. Utilisez un lien ou JSON."
                    ),
                },
            ],
            note: L("需社区登录", "需社群登入", "Community login", "ログインが必要", "커뮤니티 로그인", "Connexion requise"),
            cursor: {
                at: 1.2,
                path: [
                    [64, 62],
                    [66, 66],
                    [68, 68],
                ],
                clickAt: 1.6,
            },
        },
        {
            id: "recap",
            chapter: L("回顾", "回顧", "Recap", "まとめ", "정리", "Récapitulatif"),
            duration: 8,
            shot: {
                type: "recap",
                title: L(
                    "把构筑变成可复现的实验",
                    "把構築變成可重現的實驗",
                    "Turn a build into a reproducible experiment",
                    "構築を再現可能な実験に",
                    "빌드를 재현 가능한 실험으로",
                    "Faites de la construction une expérience reproductible"
                ),
                checklist: [
                    L(
                        "简洁模式看结果，专业模式改参数",
                        "簡潔模式看結果，專業模式改參數",
                        "Simple mode reads, pro mode edits",
                        "シンプルは結果、プロは編集",
                        "간단 모드는 결과, 전문 모드는 편집",
                        "Le simple lit, le pro édite"
                    ),
                    L(
                        "技能字段能拖进自定义变量，再在目标函数里复用",
                        "技能欄位能拖進自訂變數，再在目標函數裡複用",
                        "Skill fields drag into custom variables, then get reused in the target function",
                        "スキル項目をカスタム変数へ入れ、目標関数で再利用",
                        "스킬 필드를 사용자 변수로 넣고 목표 함수에서 재사용",
                        "Les champs de compétence vont dans une variable, réutilisée dans la fonction cible"
                    ),
                    L(
                        "当前配置自动保存，分享生成完整链接",
                        "目前設定自動儲存，分享產生完整連結",
                        "Settings auto-save; sharing creates a full link",
                        "設定は自動保存、共有は完全リンク",
                        "설정은 자동 저장, 공유는 전체 링크",
                        "Sauvegarde auto, partage par lien complet"
                    ),
                ],
                route: "/char",
                routeLabel: L(
                    "去构筑一个角色",
                    "去構築一個角色",
                    "Build a character",
                    "キャラを構築する",
                    "캐릭터 빌드하기",
                    "Construire un personnage"
                ),
                hint: L(
                    "下一步：用构筑对比同时看两套方案",
                    "下一步：用構築對比同時看兩套方案",
                    "Next: compare two builds side by side",
                    "次へ：2つの構築を比較",
                    "다음: 두 빌드 비교",
                    "Ensuite : comparer deux builds"
                ),
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "现在，去算一套属于你的构筑。",
                        "現在，去算一套屬於你的構築。",
                        "Now go calculate a build that is yours.",
                        "さあ、あなたの構築を計算しよう。",
                        "이제 당신의 빌드를 계산해 보세요.",
                        "À vous de calculer votre construction."
                    ),
                },
            ],
        },
    ],
}
