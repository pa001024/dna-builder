import { type GraphNode, type GraphPaletteGroup, type GraphPort, L, type Tutorial } from "../types"

type NodeBase = Omit<GraphNode, "x" | "y" | "at">

const GRAPH_TITLE = L(
    "赛琪风伤数据流",
    "賽琪風傷數據流",
    "Saiqi wind DPS flow",
    "サイキ風ダメージフロー",
    "사이치 바람 피해 흐름",
    "Flux DPS Vent de Saiqi"
)

const PALETTE: GraphPaletteGroup[] = [
    {
        label: L("输入节点", "輸入節點", "Input nodes", "入力ノード", "입력 노드", "Nœuds d'entrée"),
        color: "#22c55e",
        icon: "ri:user-line",
        items: [
            L("角色输入", "角色輸入", "Character input", "キャラ入力", "캐릭터 입력", "Entrée personnage"),
            L("近战武器输入", "近戰武器輸入", "Melee weapon input", "近接武器入力", "근접 무기 입력", "Entrée arme de mêlée"),
            L("远程武器输入", "遠程武器輸入", "Ranged weapon input", "遠隔武器入力", "원거리 무기 입력", "Entrée arme à distance"),
            L("MOD输入", "MOD輸入", "MOD input", "MOD 入力", "MOD 입력", "Entrée MOD"),
            L("BUFF与队友", "BUFF與隊友", "BUFF & allies", "BUFF と味方", "BUFF와 동료", "BUFF et alliés"),
            L("特效设置", "特效設定", "Effect settings", "エフェクト設定", "이펙트 설정", "Réglages d'effet"),
            L("魔灵设置", "魔靈設定", "Spirit settings", "精霊設定", "정령 설정", "Réglages d'esprit"),
            L("自定义变量组", "自訂變數組", "Custom variables", "カスタム変数", "사용자 변수", "Variables perso"),
            L("敌人设置", "敵人設定", "Enemy settings", "敵設定", "적 설정", "Réglages d'ennemi"),
            L("DOT频率", "DOT頻率", "DOT rate", "DOT 頻度", "DOT 빈도", "Fréquence DOT"),
        ],
    },
    {
        label: L("计算节点", "計算節點", "Calculation nodes", "計算ノード", "계산 노드", "Nœuds de calcul"),
        color: "#3b82f6",
        icon: "ri:cpu-line",
        items: [
            L("核心节点", "核心節點", "Core node", "コアノード", "코어 노드", "Nœud central"),
            L("计算属性", "計算屬性", "Calculate stats", "属性計算", "속성 계산", "Calcul des stats"),
            L("计算武器属性", "計算武器屬性", "Calculate weapon stats", "武器属性計算", "무기 속성 계산", "Calcul des stats d'arme"),
            L("加法计算", "加法計算", "Add", "加算", "덧셈", "Addition"),
            L("乘法计算", "乘法計算", "Multiply", "乗算", "곱셈", "Multiplication"),
            L("表达式计算", "表達式計算", "Expression", "式計算", "수식 계산", "Expression"),
            L("向量计算", "向量計算", "Vector math", "ベクトル計算", "벡터 계산", "Calcul vectoriel"),
            L("集线节点", "集線節點", "Hub node", "ハブノード", "허브 노드", "Nœud concentrateur"),
            L("BUFF合并", "BUFF合併", "BUFF merge", "BUFF 統合", "BUFF 병합", "Fusion de BUFF"),
        ],
    },
    {
        label: L("输出节点", "輸出節點", "Output nodes", "出力ノード", "출력 노드", "Nœuds de sortie"),
        color: "#e11d48",
        icon: "ri:fire-line",
        items: [
            L("属性输出", "屬性輸出", "Stats output", "属性出力", "속성 출력", "Sortie des stats"),
            L("武器输出", "武器輸出", "Weapon output", "武器出力", "무기 출력", "Sortie d'arme"),
            L("图表", "圖表", "Chart", "グラフ", "차트", "Graphique"),
            L("JSON导出", "JSON匯出", "JSON export", "JSON エクスポート", "JSON 내보내기", "Export JSON"),
        ],
    },
    {
        label: L("特殊节点", "特殊節點", "Special nodes", "特殊ノード", "특수 노드", "Nœuds spéciaux"),
        color: "#a855f7",
        icon: "ri:function-line",
        items: [
            L("目标函数", "目標函數", "Target function", "目標関数", "목표 함수", "Fonction cible"),
            L(
                "自定义变量求值",
                "自訂變數求值",
                "Evaluate custom variable",
                "カスタム変数評価",
                "사용자 변수 평가",
                "Évaluation de variable perso"
            ),
        ],
    },
    {
        label: L("基础组件", "基礎元件", "Basic parts", "基本部品", "기본 구성 요소", "Composants de base"),
        color: "#94a3b8",
        icon: "ri:box-1-line",
        items: [
            L("分组", "分組", "Group", "グループ", "그룹", "Groupe"),
            L("标签", "標籤", "Label", "ラベル", "라벨", "Étiquette"),
            L("数值输入", "數值輸入", "Number input", "数値入力", "숫자 입력", "Entrée numérique"),
            L("向量输入", "向量輸入", "Vector input", "ベクトル入力", "벡터 입력", "Entrée vectorielle"),
        ],
    },
    {
        label: L("构筑来源", "構築來源", "Build sources", "構築ソース", "빌드 소스", "Sources de build"),
        color: "#14b8a6",
        icon: "ri:database-2-line",
        items: [
            L("JSON构筑", "JSON構築", "JSON build", "JSON 構築", "JSON 빌드", "Build JSON"),
            L("在线构筑", "線上構築", "Online build", "オンライン構築", "온라인 빌드", "Build en ligne"),
        ],
    },
]

const PORT_CHAR: GraphPort = { label: L("角色", "角色", "Character", "キャラ", "캐릭터", "Personnage"), color: "#22c55e" }
const PORT_MELEE: GraphPort = {
    label: L("近战武器", "近戰武器", "Melee weapon", "近接武器", "근접 무기", "Arme de mêlée"),
    color: "#f87171",
}
const PORT_RANGED: GraphPort = {
    label: L("远程武器", "遠程武器", "Ranged weapon", "遠隔武器", "원거리 무기", "Arme à distance"),
    color: "#fb923c",
}
const PORT_MOD: GraphPort = { label: L("MOD", "MOD", "MOD", "MOD", "MOD", "MOD"), color: "#a855f7" }
const PORT_BUFF: GraphPort = {
    label: L("BUFF / 队友", "BUFF / 隊友", "BUFF / Ally", "BUFF / 味方", "BUFF / 동료", "BUFF / Allié"),
    color: "#eab308",
}
const PORT_BUILD: GraphPort = { label: L("构筑", "構築", "Build", "構築", "빌드", "Build"), color: "#3b82f6" }
const PORT_NUMBER: GraphPort = { label: L("数值", "數值", "Number", "数値", "숫자", "Valeur"), color: "#94a3b8" }
const PORT_VECTOR: GraphPort = { label: L("向量", "向量", "Vector", "ベクトル", "벡터", "Vecteur"), color: "#a3e635" }

const KIND_INPUT = L("输入节点", "輸入節點", "Input node", "入力ノード", "입력 노드", "Nœud d'entrée")
const KIND_CALC = L("计算节点", "計算節點", "Calculation node", "計算ノード", "계산 노드", "Nœud de calcul")
const KIND_SPECIAL = L("特殊节点", "特殊節點", "Special node", "特殊ノード", "특수 노드", "Nœud spécial")

const NODE_CHAR: NodeBase = {
    title: L("角色输入", "角色輸入", "Character input", "キャラ入力", "캐릭터 입력", "Entrée personnage"),
    kind: "input",
    color: "#22c55e",
    icon: "ri:user-line",
    kindLabel: KIND_INPUT,
    subtitle: L(
        "选择角色并设置等级",
        "選擇角色並設定等級",
        "Pick a character and set levels",
        "キャラを選び、レベルを設定",
        "캐릭터 선택 및 레벨 설정",
        "Choisir un personnage et ses niveaux"
    ),
    outputs: [PORT_CHAR],
}

const NODE_MELEE: NodeBase = {
    title: L("近战武器输入", "近戰武器輸入", "Melee weapon input", "近接武器入力", "근접 무기 입력", "Entrée arme de mêlée"),
    kind: "input",
    color: "#f87171",
    icon: "ri:sword-line",
    kindLabel: KIND_INPUT,
    subtitle: L("选择近战武器", "選擇近戰武器", "Pick a melee weapon", "近接武器を選択", "근접 무기 선택", "Choisir une arme de mêlée"),
    outputs: [PORT_MELEE],
}

const NODE_RANGED: NodeBase = {
    title: L("远程武器输入", "遠程武器輸入", "Ranged weapon input", "遠隔武器入力", "원거리 무기 입력", "Entrée arme à distance"),
    kind: "input",
    color: "#fb923c",
    icon: "ri:crosshair-line",
    kindLabel: KIND_INPUT,
    subtitle: L(
        "选择远程武器",
        "選擇遠程武器",
        "Pick a ranged weapon",
        "遠隔武器を選択",
        "원거리 무기 선택",
        "Choisir une arme à distance"
    ),
    outputs: [PORT_RANGED],
}

const NODE_MOD: NodeBase = {
    title: L("MOD输入", "MOD輸入", "MOD input", "MOD 入力", "MOD 입력", "Entrée MOD"),
    kind: "input",
    color: "#a855f7",
    icon: "ri:grid-line",
    kindLabel: KIND_INPUT,
    subtitle: L(
        "添加角色 / 武器 MOD",
        "新增角色 / 武器 MOD",
        "Add character / weapon MODs",
        "キャラ・武器 MOD を追加",
        "캐릭터/무기 MOD 추가",
        "Ajouter des MODs personnage / arme"
    ),
    outputs: [PORT_MOD],
}

const NODE_BUFF: NodeBase = {
    title: L("BUFF与队友", "BUFF與隊友", "BUFF & allies", "BUFF と味方", "BUFF와 동료", "BUFF et alliés"),
    kind: "input",
    color: "#eab308",
    icon: "ri:flashlight-line",
    kindLabel: KIND_INPUT,
    subtitle: L(
        "添加 Buff 与协战队友",
        "新增 Buff 與協戰隊友",
        "Add Buffs and allied teammates",
        "Buff と共闘仲間を追加",
        "Buff와 협전 동료 추가",
        "Ajouter Buffs et alliés"
    ),
    outputs: [PORT_BUFF],
}

const CORE_INPUTS: GraphPort[] = [
    PORT_BUILD,
    PORT_CHAR,
    PORT_MELEE,
    PORT_RANGED,
    PORT_MOD,
    PORT_BUFF,
    { label: L("特效设置", "特效設定", "Effect settings", "エフェクト設定", "이펙트 설정", "Réglages d'effet"), color: "#ec4899" },
    { label: L("魔灵设置", "魔靈設定", "Spirit settings", "精霊設定", "정령 설정", "Réglages d'esprit"), color: "#8b5cf6" },
    { label: L("敌人设置", "敵人設定", "Enemy settings", "敵設定", "적 설정", "Réglages d'ennemi"), color: "#b91c1c" },
    { label: L("自定义变量组", "自訂變數組", "Custom variables", "カスタム変数", "사용자 변수", "Variables perso"), color: "#14b8a6" },
    { label: L("DOT 频率", "DOT 頻率", "DOT rate", "DOT 頻度", "DOT 빈도", "Fréquence DOT"), color: "#f97316" },
]

const NODE_CORE: NodeBase = {
    title: L("核心节点", "核心節點", "Core node", "コアノード", "코어 노드", "Nœud central"),
    kind: "calc",
    color: "#3b82f6",
    icon: "ri:cpu-line",
    kindLabel: KIND_CALC,
    subtitle: L(
        "所有输入都需要连接到核心节点",
        "所有輸入都需要連接到核心節點",
        "Every input connects to the core node",
        "すべての入力はコアノードへ接続",
        "모든 입력은 코어 노드에 연결",
        "Toutes les entrées se connectent au nœud central"
    ),
    inputs: CORE_INPUTS,
    outputs: [PORT_BUILD],
}

const NODE_TARGET: NodeBase = {
    title: L("目标函数", "目標函數", "Target function", "目標関数", "목표 함수", "Fonction cible"),
    kind: "calc",
    color: "#a855f7",
    icon: "ri:function-line",
    kindLabel: KIND_SPECIAL,
    subtitle: L(
        "自定义表达式计算",
        "自訂表達式計算",
        "Custom expression",
        "カスタム式で計算",
        "사용자 수식 계산",
        "Expression personnalisée"
    ),
    inputs: [PORT_BUILD],
    outputs: [PORT_NUMBER, PORT_VECTOR],
}

export const flowTutorial: Tutorial = {
    id: "flow",
    number: "07",
    category: "data",
    title: L("节点编辑器", "節點編輯器", "Node Editor", "ノードエディタ", "노드 편집기", "Éditeur de nœuds"),
    subtitle: L(
        "把构筑做成可视化数据流",
        "把構築做成視覺化資料流",
        "Turn a build into a visual data flow",
        "構築を可視化されたデータフローに",
        "빌드를 시각적 데이터 흐름으로",
        "Transformez un build en flux de données visuel"
    ),
    summary: L(
        "从节点库拖入输入，经核心节点合并构筑，再由目标函数算伤害：类型化端口、64 组上限、Worker 性能统计、自动保存与分享。",
        "從節點庫拖入輸入，經核心節點合併構築，再由目標函數算傷害：型別化埠、64 組上限、Worker 效能統計、自動儲存與分享。",
        "Drag inputs from the palette, merge them into a build in the core node, then evaluate damage with the target function: typed ports, a 64-combination cap, Worker performance stats, auto-save, and sharing.",
        "ライブラリから入力をドラッグし、コアノードで構築に統合、目標関数でダメージを算出。型付きポート、64組上限、Worker 性能統計、自動保存と共有。",
        "노드 라이브러리에서 입력을 드래그하고 코어 노드에서 빌드로 병합한 뒤 목표 함수로 피해를 계산합니다. 타입 포트, 64조합 상한, Worker 성능 통계, 자동 저장과 공유.",
        "Glissez des entrées, fusionnez-les en build dans le nœud central, puis calculez les dégâts avec la fonction cible : ports typés, limite de 64 combinaisons, stats Worker, sauvegarde auto et partage."
    ),
    icon: "ri:node-tree",
    accent: "#fc466b",
    route: "/flow",
    routeLabel: L(
        "打开节点编辑器",
        "開啟節點編輯器",
        "Open Node Editor",
        "ノードエディタを開く",
        "노드 편집기 열기",
        "Ouvrir l'éditeur de nœuds"
    ),
    platforms: ["web"],
    scenes: [
        {
            id: "intro",
            chapter: L("开场", "開場", "Intro", "導入", "인트로", "Intro"),
            duration: 4.5,
            shot: {
                type: "title",
                variant: "intro",
                kicker: L("EP 07 · 数据", "EP 07 · 資料", "EP 07 · DATA", "EP 07 · データ", "EP 07 · 데이터", "EP 07 · DONNÉES"),
                title: L("节点编辑器", "節點編輯器", "Node Editor", "ノードエディタ", "노드 편집기", "Éditeur de nœuds"),
                subtitle: L(
                    "不写代码，也能把输入、计算、输出连成一张图。",
                    "不寫程式，也能把輸入、計算、輸出連成一張圖。",
                    "No code needed: connect inputs, calculations, and outputs into one graph.",
                    "コードなしで、入力・計算・出力を一枚の図に。",
                    "코드 없이 입력, 계산, 출력을 하나의 그래프로.",
                    "Sans code : reliez entrées, calculs et sorties dans un seul graphe."
                ),
                icon: "ri:node-tree",
                index: "07",
            },
            captions: [
                {
                    at: 0.9,
                    text: L(
                        "这一集，把构筑搭成一张可以运行的数据流。",
                        "這一集，把構築搭成一張可以執行的資料流。",
                        "This episode turns a build into a runnable data flow.",
                        "今回は構築を実行できるデータフローにします。",
                        "이번 편에서는 빌드를 실행 가능한 데이터 흐름으로 만듭니다.",
                        "Dans cet épisode, transformez une construction en flux de données exécutable."
                    ),
                },
            ],
        },
        {
            id: "palette",
            chapter: L("节点库", "節點庫", "Node library", "ノードライブラリ", "노드 라이브러리", "Bibliothèque"),
            duration: 9,
            shot: {
                type: "graph",
                phase: "palette",
                title: GRAPH_TITLE,
                palette: PALETTE,
                nodes: [
                    { ...NODE_CHAR, x: 26.5, y: 46, at: 3.3 },
                    { ...NODE_CORE, x: 56, y: 46, at: 3.6 },
                    { ...NODE_TARGET, x: 84, y: 46, at: 3.9 },
                ],
                edges: [
                    { from: 0, to: 1, toPort: 1, at: 4.3 },
                    { from: 1, to: 2, fromPort: 0, at: 4.7 },
                ],
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "左侧节点库分六类：输入、计算、输出、特殊、基础、构筑来源。",
                        "左側節點庫分六類：輸入、計算、輸出、特殊、基礎、構築來源。",
                        "The left palette has six groups: input, calculation, output, special, basic, build source.",
                        "左のライブラリは6分類：入力・計算・出力・特殊・基本・構築ソース。",
                        "왼쪽 노드 라이브러리는 입력, 계산, 출력, 특수, 기본, 빌드 소스 여섯 가지입니다.",
                        "La palette de gauche compte six groupes : entrée, calcul, sortie, spécial, base, source de build."
                    ),
                },
                {
                    at: 5.2,
                    text: L(
                        "拖入角色输入、核心节点和目标函数，再按端口类型接起来。",
                        "拖入角色輸入、核心節點和目標函數，再按埠型別接起來。",
                        "Drag in a character input, the core node, and the target function, then wire them by port type.",
                        "キャラ入力・コアノード・目標関数をドラッグし、ポート型に従って接続。",
                        "캐릭터 입력, 코어 노드, 목표 함수를 드래그한 뒤 포트 타입에 맞게 연결합니다.",
                        "Glissez une entrée personnage, le nœud central et la fonction cible, puis reliez selon le type de port."
                    ),
                },
            ],
        },
        {
            id: "build",
            chapter: L("搭基础图", "搭基礎圖", "Base graph", "基本グラフ", "기본 그래프", "Graphe de base"),
            duration: 10,
            shot: {
                type: "graph",
                phase: "connect",
                title: GRAPH_TITLE,
                palette: PALETTE,
                nodes: [
                    { ...NODE_CHAR, x: 26.5, y: 18, at: 0.4 },
                    { ...NODE_MELEE, x: 26.5, y: 34, at: 0.7 },
                    { ...NODE_MOD, x: 26.5, y: 50, at: 1.0 },
                    { ...NODE_BUFF, x: 26.5, y: 66, at: 1.3 },
                    { ...NODE_CORE, x: 56, y: 50, at: 1.9 },
                    { ...NODE_TARGET, x: 84, y: 50, at: 2.3 },
                ],
                edges: [
                    { from: 0, to: 4, toPort: 1, at: 2.6 },
                    { from: 1, to: 4, toPort: 2, at: 2.8 },
                    { from: 2, to: 4, toPort: 4, at: 3.0 },
                    { from: 3, to: 4, toPort: 5, at: 3.2 },
                    { from: 4, to: 5, fromPort: 0, at: 3.6 },
                ],
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "基础链路只有三步：输入 → 核心节点 → 目标函数。",
                        "基礎鏈路只有三步：輸入 → 核心節點 → 目標函數。",
                        "The base chain is just three steps: input → core node → target function.",
                        "基本の流れは3ステップ：入力 → コアノード → 目標関数。",
                        "기본 흐름은 세 단계입니다: 입력 → 코어 노드 → 목표 함수.",
                        "La chaîne de base tient en trois étapes : entrée → nœud central → fonction cible."
                    ),
                },
                {
                    at: 5.0,
                    text: L(
                        "角色、武器、MOD、BUFF 都直接接核心节点；核心节点输出构筑给目标函数。",
                        "角色、武器、MOD、BUFF 都直接接核心節點；核心節點輸出構築給目標函數。",
                        "Character, weapon, MODs, and BUFFs plug straight into the core node; the core outputs a build to the target function.",
                        "キャラ・武器・MOD・BUFF はコアノードへ直接接続。コアの構築出力を目標関数へ。",
                        "캐릭터, 무기, MOD, BUFF는 코어 노드에 직접 연결되고, 코어의 빌드 출력이 목표 함수로 이어집니다.",
                        "Personnage, arme, MODs et BUFFs se branchent au nœud central ; sa sortie build alimente la fonction cible."
                    ),
                },
            ],
            callouts: [
                {
                    at: 2.4,
                    text: L(
                        "11 个类型化输入",
                        "11 個型別化輸入",
                        "11 typed inputs",
                        "11 個の型付き入力",
                        "11개 타입 입력",
                        "11 entrées typées"
                    ),
                    x: 58,
                    y: 19,
                },
            ],
        },
        {
            id: "ports",
            chapter: L("端口与连接", "埠與連接", "Ports & links", "ポートと接続", "포트와 연결", "Ports et liens"),
            duration: 10,
            shot: {
                type: "graph",
                phase: "connect",
                menu: true,
                title: GRAPH_TITLE,
                palette: PALETTE,
                nodes: [
                    { ...NODE_CHAR, x: 26.5, y: 12, at: 0.4 },
                    { ...NODE_MELEE, x: 26.5, y: 24, at: 0.55 },
                    { ...NODE_RANGED, x: 26.5, y: 36, at: 0.7 },
                    { ...NODE_MOD, x: 26.5, y: 48, at: 0.85 },
                    { ...NODE_MOD, x: 26.5, y: 60, at: 0.95 },
                    { ...NODE_BUFF, x: 26.5, y: 72, at: 1.05 },
                    { ...NODE_CORE, x: 56, y: 50, at: 1.6 },
                    { ...NODE_TARGET, x: 84, y: 50, at: 1.9 },
                ],
                edges: [
                    { from: 0, to: 6, toPort: 1, at: 2.4 },
                    { from: 1, to: 6, toPort: 2, at: 2.6 },
                    { from: 2, to: 6, toPort: 3, at: 2.8 },
                    { from: 3, to: 6, toPort: 4, at: 3.0 },
                    { from: 4, to: 6, toPort: 4, at: 3.15 },
                    { from: 5, to: 6, toPort: 5, at: 3.3 },
                    { from: 6, to: 7, fromPort: 0, at: 3.9 },
                ],
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "端口颜色表示类型；连接菜单只列兼容候选，MOD 和 BUFF 可以多连。",
                        "埠顏色代表型別；連接選單只列相容候選，MOD 和 BUFF 可以多連。",
                        "Port color shows the type; the menu lists compatible candidates only, and MOD / BUFF accept several links.",
                        "ポート色は型の目印。接続メニューは互換候補のみを表示し、MOD / BUFF は複数接続できます。",
                        "포트 색은 타입을 나타냅니다. 연결 메뉴에는 호환 후보만 표시되며 MOD / BUFF는 여러 개 연결할 수 있습니다.",
                        "La couleur du port indique le type ; le menu ne liste que les compatibles, et MOD / BUFF acceptent plusieurs liens."
                    ),
                },
                {
                    at: 5.2,
                    text: L(
                        "从端口拖到空白超过 6px，会弹出连接菜单，只列兼容候选。",
                        "從埠拖到空白超過 6px，會彈出連接選單，只列相容候選。",
                        "Drag a port more than 6px onto empty space to open the connection menu, listing compatible candidates only.",
                        "ポートを空白へ6px以上ドラッグすると接続メニューが開き、互換候補だけを表示。",
                        "포트를 빈 공간으로 6px 이상 끌면 연결 메뉴가 열리고 호환 후보만 표시됩니다.",
                        "Glissez un port de plus de 6px dans le vide : le menu de connexion ne liste que les candidats compatibles."
                    ),
                },
            ],
            callouts: [
                {
                    at: 2.0,
                    text: L("端口颜色 = 类型", "埠顏色 = 型別", "Port color = type", "ポート色 = 型", "포트 색 = 타입", "Couleur = type"),
                    x: 64,
                    y: 70,
                },
                {
                    at: 4.8,
                    text: L(
                        "拖到空白 → 连接菜单",
                        "拖到空白 → 連接選單",
                        "Drag to empty → connect menu",
                        "空白へ → 接続メニュー",
                        "빈 공간으로 → 연결 메뉴",
                        "Vide → menu de connexion"
                    ),
                    x: 54,
                    y: 62,
                },
            ],
        },
        {
            id: "run",
            chapter: L("求值", "求值", "Evaluate", "評価", "평가", "Évaluation"),
            duration: 10,
            shot: {
                type: "graph",
                phase: "run",
                title: GRAPH_TITLE,
                palette: PALETTE,
                nodes: [
                    { ...NODE_CHAR, x: 26.5, y: 22, at: 0.4 },
                    { ...NODE_MOD, x: 26.5, y: 42, at: 0.6 },
                    { ...NODE_BUFF, x: 26.5, y: 62, at: 0.8 },
                    { ...NODE_CORE, x: 56, y: 50, at: 1.2 },
                    { ...NODE_TARGET, x: 84, y: 50, at: 1.6 },
                ],
                edges: [
                    { from: 0, to: 3, toPort: 1, at: 1.8 },
                    { from: 1, to: 3, toPort: 4, at: 2.0 },
                    { from: 2, to: 3, toPort: 5, at: 2.2 },
                    { from: 3, to: 4, fromPort: 0, at: 2.6 },
                ],
                output: {
                    label: L("DPS 输出", "DPS 輸出", "DPS output", "DPS 出力", "DPS 출력", "Sortie DPS"),
                    value: "18,420",
                    node: 4,
                    hint: L(
                        "Worker 构筑求值 · 3 次请求",
                        "Worker 構築求值 · 3 次請求",
                        "Worker build evaluation · 3 requests",
                        "Worker 構築評価 · 3 リクエスト",
                        "Worker 빌드 평가 · 3회 요청",
                        "Évaluation Worker du build · 3 requêtes"
                    ),
                },
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "核心节点合并构筑，目标函数在 Worker 里求值，画布不卡。",
                        "核心節點合併構築，目標函數在 Worker 裡求值，畫布不卡。",
                        "The core node merges the build, and the target function evaluates in a Worker so the canvas stays smooth.",
                        "コアノードが構築を統合し、目標関数は Worker で評価。キャンバスは固まりません。",
                        "코어 노드가 빌드를 병합하고 목표 함수는 Worker에서 평가되어 캔버스가 멈추지 않습니다.",
                        "Le nœud central fusionne le build et la fonction cible s'évalue dans un Worker : le canevas reste fluide."
                    ),
                },
                {
                    at: 5.2,
                    text: L(
                        "一次最多 64 组输入组合，超过会返回「输入组合过多」并跳过求值。",
                        "一次最多 64 組輸入組合，超過會回傳「輸入組合過多」並跳過求值。",
                        "One assembly allows up to 64 input combinations; beyond that it returns “too many input combinations” and skips evaluation.",
                        "1回の組み立ては最大64組。超えると「入力組み合わせ過多」を返し評価をスキップ。",
                        "한 번에 최대 64조합까지 가능하며, 초과하면 “입력 조합 과다”를 반환하고 평가를 건너뜁니다.",
                        "Un assemblage accepte jusqu'à 64 combinaisons ; au-delà, « trop de combinaisons » et l'évaluation est ignorée."
                    ),
                },
            ],
        },
        {
            id: "perf",
            chapter: L("性能", "效能", "Performance", "パフォーマンス", "성능", "Performances"),
            duration: 9.5,
            shot: {
                type: "graph",
                phase: "perf",
                title: GRAPH_TITLE,
                palette: PALETTE,
                nodes: [
                    { ...NODE_CHAR, x: 26.5, y: 24, at: 0.4 },
                    { ...NODE_MOD, x: 26.5, y: 44, at: 0.6 },
                    { ...NODE_BUFF, x: 26.5, y: 64, at: 0.8 },
                    { ...NODE_CORE, x: 56, y: 50, at: 1.2 },
                    { ...NODE_TARGET, x: 84, y: 50, at: 1.6 },
                ],
                edges: [
                    { from: 0, to: 3, toPort: 1, at: 1.8 },
                    { from: 1, to: 3, toPort: 4, at: 2.0 },
                    { from: 2, to: 3, toPort: 5, at: 2.2 },
                    { from: 3, to: 4, fromPort: 0, at: 2.6 },
                ],
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "左侧切到「性能」tab，同步阶段和 Worker 请求都在这。",
                        "左側切到「效能」tab，同步階段和 Worker 請求都在這。",
                        "Switch the left sidebar to Perf: sync phases and Worker requests both live here.",
                        "左側を「パフォーマンス」tab に切り替えると、同期フェーズと Worker リクエストが並びます。",
                        "왼쪽을 “성능” tab으로 전환하면 동기 단계와 Worker 요청이 표시됩니다.",
                        "Passez la barre latérale sur Perf : phases de sync et requêtes Worker s'affichent ici."
                    ),
                },
                {
                    at: 4.6,
                    text: L(
                        "节点调用按耗时排序，慢节点和每次调用一眼可见。",
                        "節點呼叫按耗時排序，慢節點和每次呼叫一眼可見。",
                        "Node calls are sorted by time, so slow nodes and each call are easy to spot.",
                        "ノード呼出は時間順。遅いノードと各呼び出しが一目で分かります。",
                        "노드 호출은 소요 시간순으로 정렬되어 느린 노드와 각 호출을 바로 볼 수 있습니다.",
                        "Les appels de nœuds sont triés par durée : le nœud lent et chaque appel se repèrent d'un coup d'œil."
                    ),
                },
            ],
        },
        {
            id: "editing",
            chapter: L("编辑效率", "編輯效率", "Edit faster", "編集効率", "편집 효율", "Édition rapide"),
            duration: 9.5,
            shot: {
                type: "callout",
                kicker: "EDIT FASTER",
                title: L(
                    "画布编辑的快捷键",
                    "畫布編輯的快速鍵",
                    "Canvas shortcuts",
                    "キャンバスのショートカット",
                    "캔버스 단축키",
                    "Raccourcis du canevas"
                ),
                icon: "ri:keyboard-line",
                points: [
                    {
                        icon: "ri:save-line",
                        text: L(
                            "自动保存默认开启，停手 2 秒写入；Ctrl+S 立即保存",
                            "自動儲存預設開啟，停手 2 秒寫入；Ctrl+S 立即儲存",
                            "Auto-save is on by default and writes after a 2-second pause; Ctrl+S saves now",
                            "自動保存は既定で有効、2秒停止で書き込み。Ctrl+S ですぐ保存",
                            "자동 저장은 기본으로 켜져 있으며 2초 멈추면 기록됩니다. Ctrl+S는 즉시 저장",
                            "La sauvegarde auto écrit après 2 s d'inactivité ; Ctrl+S enregistre tout de suite"
                        ),
                    },
                    {
                        icon: "ri:history-line",
                        text: L(
                            "Ctrl+Z 撤销，Ctrl+Shift+Z 或 Ctrl+Y 重做",
                            "Ctrl+Z 復原，Ctrl+Shift+Z 或 Ctrl+Y 重做",
                            "Ctrl+Z undoes; Ctrl+Shift+Z or Ctrl+Y redoes",
                            "Ctrl+Z で元に戻す、Ctrl+Shift+Z または Ctrl+Y でやり直し",
                            "Ctrl+Z 실행 취소, Ctrl+Shift+Z 또는 Ctrl+Y 다시 실행",
                            "Ctrl+Z annule ; Ctrl+Shift+Z ou Ctrl+Y rétablit"
                        ),
                    },
                    {
                        icon: "ri:file-copy-line",
                        text: L(
                            "Ctrl+拖动复制节点及连线；Ctrl+Alt+拖动只复制节点",
                            "Ctrl+拖曳複製節點及連線；Ctrl+Alt+拖曳只複製節點",
                            "Ctrl+drag copies nodes and edges; Ctrl+Alt+drag copies nodes only",
                            "Ctrl+ドラッグでノードと接続を複製。Ctrl+Alt+ドラッグはノードのみ",
                            "Ctrl+드래그는 노드와 연결을 복제, Ctrl+Alt+드래그는 노드만 복제",
                            "Ctrl+glisser copie nœuds et liens ; Ctrl+Alt+glisser copie les nœuds seuls"
                        ),
                    },
                    {
                        icon: "ri:drag-move-line",
                        text: L(
                            "Shift / Ctrl / Meta 多选，Delete 删除",
                            "Shift / Ctrl / Meta 多選，Delete 刪除",
                            "Shift / Ctrl / Meta multi-selects; Delete removes",
                            "Shift / Ctrl / Meta で複数選択、Delete で削除",
                            "Shift / Ctrl / Meta 다중 선택, Delete 삭제",
                            "Shift / Ctrl / Meta pour multi-sélectionner ; Delete supprime"
                        ),
                    },
                ],
                note: L(
                    "右键画布也有撤销 / 重做 / 复制 / 粘贴",
                    "右鍵畫布也有復原 / 重做 / 複製 / 貼上",
                    "Right-click the canvas for undo, redo, copy, paste",
                    "右クリックにも元に戻す・やり直し・コピー・貼り付け",
                    "캔버스 우클릭에도 실행 취소 / 다시 실행 / 복사 / 붙여넣기",
                    "Clic droit : annuler, rétablir, copier, coller"
                ),
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "自动保存默认开启，停手 2 秒就写入；Ctrl+S 立即保存。",
                        "自動儲存預設開啟，停手 2 秒就寫入；Ctrl+S 立即儲存。",
                        "Auto-save is on by default and writes after a 2-second pause; Ctrl+S saves immediately.",
                        "自動保存は既定で有効、2秒停止で書き込み。Ctrl+S ですぐ保存。",
                        "자동 저장은 기본으로 켜져 있으며 2초 멈추면 기록됩니다. Ctrl+S는 즉시 저장합니다.",
                        "La sauvegarde auto est active : écriture après 2 s d'inactivité ; Ctrl+S enregistre tout de suite."
                    ),
                },
                {
                    at: 4.9,
                    text: L(
                        "Ctrl+拖动会连节点带线一起复制；Shift 多选，Delete 删除。",
                        "Ctrl+拖曳會連節點帶線一起複製；Shift 多選，Delete 刪除。",
                        "Ctrl+drag duplicates nodes with their edges; Shift multi-selects, Delete removes.",
                        "Ctrl+ドラッグでノードと接続をまとめて複製。Shift で複数選択、Delete で削除。",
                        "Ctrl+드래그는 노드와 연결을 함께 복제합니다. Shift는 다중 선택, Delete는 삭제입니다.",
                        "Ctrl+glisser duplique nœuds et liens ; Shift pour multi-sélectionner, Delete pour supprimer."
                    ),
                },
            ],
        },
        {
            id: "share",
            chapter: L("分享", "分享", "Share", "共有", "공유", "Partage"),
            duration: 9,
            shot: {
                type: "modal",
                title: L("分享节点图", "分享節點圖", "Share node graph", "ノード図を共有", "노드 그래프 공유", "Partager le graphe"),
                description: L(
                    "将当前画布的全部节点与连线打包分享，载入后可继续编辑与求值。",
                    "將目前畫布的全部節點與連線打包分享，載入後可繼續編輯與求值。",
                    "Package every node and edge on the canvas; open it later to keep editing and evaluating.",
                    "現在のキャンバスの全ノードと接続をまとめて共有。読み込んだ後も編集と評価が可能。",
                    "현재 캔버스의 모든 노드와 연결을 묶어 공유합니다. 불러온 뒤에도 편집과 평가가 가능합니다.",
                    "Emballez tous les nœuds et liens du canevas ; une fois ouvert, vous pouvez encore éditer et évaluer."
                ),
                fields: [
                    {
                        label: L("标题", "標題", "Title", "タイトル", "제목", "Titre"),
                        value: GRAPH_TITLE,
                    },
                    {
                        label: L("描述", "描述", "Description", "説明", "설명", "Description"),
                        value: L(
                            "输入 → 核心节点 → 目标函数",
                            "輸入 → 核心節點 → 目標函數",
                            "Input → core node → target function",
                            "入力 → コアノード → 目標関数",
                            "입력 → 코어 노드 → 목표 함수",
                            "Entrée → nœud central → fonction cible"
                        ),
                    },
                ],
                actions: [
                    L("取消", "取消", "Cancel", "キャンセル", "취소", "Annuler"),
                    L("分享", "分享", "Share", "共有", "공유", "Partager"),
                ],
                result: {
                    title: L(
                        "节点图分享链接已复制",
                        "節點圖分享連結已複製",
                        "Graph share link copied",
                        "ノード図の共有リンクをコピー",
                        "노드 그래프 공유 링크 복사됨",
                        "Lien de partage copié"
                    ),
                    value: "dna-builder.cn/graph/8f3a…",
                    hint: L(
                        "打开后走 /flow/:id，载入后可继续编辑与求值",
                        "開啟後走 /flow/:id，載入後可繼續編輯與求值",
                        "Opens /flow/:id, where you can keep editing and evaluating",
                        "開くと /flow/:id へ。編集と評価を続けられます",
                        "열면 /flow/:id로 이동해 계속 편집하고 평가할 수 있습니다",
                        "Ouvre /flow/:id, où l'édition et l'évaluation continuent"
                    ),
                },
                confirmAt: 1.6,
                resultAt: 2.8,
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "「分享」会把当前画布的全部节点与连线打包。",
                        "「分享」會把目前畫布的全部節點與連線打包。",
                        "Share packages every node and edge on the current canvas.",
                        "「共有」は現在のキャンバスの全ノードと接続をまとめます。",
                        "“공유”는 현재 캔버스의 모든 노드와 연결을 묶습니다.",
                        "« Partager » emballe tous les nœuds et liens du canevas."
                    ),
                },
                {
                    at: 4.8,
                    text: L(
                        "分享链接是 /graph/:id，打开后走 /flow/:id，仍可编辑求值。",
                        "分享連結是 /graph/:id，開啟後走 /flow/:id，仍可編輯求值。",
                        "The share link is /graph/:id, which opens /flow/:id and stays editable and evaluable.",
                        "共有リンクは /graph/:id。開くと /flow/:id へ進み、編集と評価を続けられます。",
                        "공유 링크는 /graph/:id이며, 열면 /flow/:id로 이동해 계속 편집하고 평가할 수 있습니다.",
                        "Le lien de partage est /graph/:id ; il ouvre /flow/:id, toujours éditable et évaluable."
                    ),
                },
            ],
            note: L(
                "分享图可编辑",
                "分享圖可編輯",
                "Shared graphs stay editable",
                "共有図は編集可能",
                "공유 그래프는 편집 가능",
                "Graphes partagés éditables"
            ),
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
            duration: 7.5,
            shot: {
                type: "recap",
                title: L(
                    "把构筑搭成一张图",
                    "把構築搭成一張圖",
                    "Build the flow, not just the number",
                    "構築を一枚の図に",
                    "빌드를 하나의 그래프로",
                    "Dessinez le flux, pas seulement le chiffre"
                ),
                checklist: [
                    L(
                        "输入 → 核心节点 → 目标函数，所有输入都接核心节点",
                        "輸入 → 核心節點 → 目標函數，所有輸入都接核心節點",
                        "Input → core node → target function; every input plugs into the core",
                        "入力 → コアノード → 目標関数。全入力はコアへ",
                        "입력 → 코어 노드 → 목표 함수, 모든 입력은 코어에 연결",
                        "Entrée → nœud central → fonction cible ; toutes les entrées vont au cœur"
                    ),
                    L(
                        "端口颜色就是类型，MOD / BUFF 可以多连",
                        "埠顏色就是型別，MOD / BUFF 可以多連",
                        "Port color is the type; MOD / BUFF accept multiple links",
                        "ポート色が型。MOD / BUFF は複数接続可",
                        "포트 색이 타입, MOD / BUFF는 여러 개 연결 가능",
                        "La couleur est le type ; MOD / BUFF acceptent plusieurs liens"
                    ),
                    L(
                        "Worker 求值，单次最多 64 组输入组合",
                        "Worker 求值，單次最多 64 組輸入組合",
                        "Worker evaluation, up to 64 input combinations per assembly",
                        "Worker 評価、1回の組み立ては最大64組",
                        "Worker 평가, 한 번에 최대 64조합",
                        "Évaluation Worker, jusqu'à 64 combinaisons par assemblage"
                    ),
                    L(
                        "性能 tab 看节点耗时，自动保存默认开启",
                        "效能 tab 看節點耗時，自動儲存預設開啟",
                        "Perf tab shows node time; auto-save is on by default",
                        "パフォーマンス tab でノード時間、自動保存は既定で有効",
                        "성능 tab에서 노드 시간 확인, 자동 저장 기본 켜짐",
                        "Onglet Perf pour le temps par nœud ; sauvegarde auto active"
                    ),
                ],
                route: "/flow",
                routeLabel: L(
                    "打开节点编辑器",
                    "開啟節點編輯器",
                    "Open Node Editor",
                    "ノードエディタを開く",
                    "노드 편집기 열기",
                    "Ouvrir l'éditeur de nœuds"
                ),
                hint: L(
                    "重要节点图，记得按 Ctrl+S",
                    "重要節點圖，記得按 Ctrl+S",
                    "For important graphs, press Ctrl+S",
                    "大事な図は Ctrl+S で保存",
                    "중요한 그래프는 Ctrl+S로 저장하세요",
                    "Pour un graphe important, Ctrl+S"
                ),
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "现在，把你的构筑搭成一张能运行的数据流。",
                        "現在，把你的構築搭成一張能執行的資料流。",
                        "Now build your own calculation as a runnable data flow.",
                        "さあ、計算したい構築を実行できるデータフローに。",
                        "이제 계산할 빌드를 실행 가능한 데이터 흐름으로 만들어 보세요.",
                        "À vous de transformer votre calcul en flux de données exécutable."
                    ),
                },
            ],
        },
    ],
}
