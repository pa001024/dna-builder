import { L, type Tutorial } from "../types"

const charName = L("赛琪", "賽琪", "Saiqi", "サイキ", "사이치", "Saiqi")
const wind = L("风", "風", "Wind", "風", "바람", "Vent")
const melee = L("塞壬的拥吻", "塞壬的擁吻", "Siren's Kiss", "セイレーンの口づけ", "세이렌의 입맞춤", "Baiser de Sirène")

export const buildAnalysisTutorial: Tutorial = {
    id: "build-analysis",
    number: "03",
    category: "build",
    title: L("构筑分析", "構築分析", "Build Analysis", "構築分析", "빌드 분석", "Analyse de build"),
    subtitle: L(
        "自动构筑、对比与养成",
        "自動構築、對比與養成",
        "Auto-build, compare, and level up",
        "自動構築・比較・育成",
        "자동 빌드, 비교, 육성",
        "Auto-build, comparaison et progression"
    ),
    summary: L(
        "用自动构筑找方向，用对比页看差值，再把结果接进养成计算。",
        "用自動構築找方向，用對比頁看差值，再把結果接進養成計算。",
        "Use auto-build to find a direction, compare the delta, then carry the result into level-up planning.",
        "自動構築で方向を探し、比較で差分を見て、育成計算へつなげます。",
        "자동 빌드로 방향을 찾고, 비교로 차이를 확인한 뒤 육성 계산으로 이어갑니다.",
        "Trouvez une direction avec l'auto-build, comparez l'écart, puis passez à la planification de progression."
    ),
    icon: "ri:table-view",
    accent: "#a6c1ee",
    route: "/char-build-compare",
    routeLabel: L("去对比构筑", "去對比構築", "Compare builds", "構築を比較", "빌드 비교", "Comparer les builds"),
    platforms: ["web"],
    scenes: [
        {
            id: "intro",
            chapter: L("开场", "開場", "Intro", "導入", "인트로", "Intro"),
            duration: 5,
            shot: {
                type: "title",
                variant: "intro",
                kicker: L("EP 03 · 构筑", "EP 03 · 構築", "EP 03 · BUILD", "EP 03 · 構築", "EP 03 · 빌드", "EP 03 · BUILD"),
                title: L("构筑分析", "構築分析", "Build Analysis", "構築分析", "빌드 분석", "Analyse de build"),
                subtitle: L(
                    "从自动构筑到养成计算，把方案变成决策。",
                    "從自動構築到養成計算，把方案變成決策。",
                    "From auto-build to level-up planning, turn a build into a decision.",
                    "自動構築から育成計算まで、構築を意思決定に。",
                    "자동 빌드부터 육성 계산까지, 빌드를 결정으로.",
                    "De l'auto-build à la progression, transformez un build en décision."
                ),
                icon: "ri:table-view",
                index: "03",
            },
            captions: [
                {
                    at: 0.9,
                    text: L(
                        "构筑不只是算一次；这集把优化、对比和养成连起来。",
                        "構築不只是算一次；這集把最佳化、對比和養成連起來。",
                        "A build is more than one number: optimize, compare, then plan the grind.",
                        "構築は一度の計算で終わらない。最適化・比較・育成をつなげます。",
                        "빌드는 한 번의 계산이 아닙니다. 최적화, 비교, 육성을 연결합니다.",
                        "Un build ne s'arrête pas à un calcul : optimisez, comparez, planifiez."
                    ),
                },
            ],
        },
        {
            id: "auto-build",
            chapter: L("自动构筑", "自動構築", "Auto-build", "自動構築", "자동 빌드", "Auto-build"),
            duration: 11,
            shot: {
                type: "build",
                mode: "auto",
                character: charName,
                element: wind,
                level: "Lv.80",
                weapon: melee,
                before: "1,284,900",
                after: "1,562,300",
                percent: "+21.6%",
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
                    {
                        label: L("使用库存", "使用庫存", "Use inventory", "在庫を使用", "재고 사용", "Utiliser le stock"),
                        value: L("开启", "開啟", "On", "オン", "켜짐", "Activé"),
                    },
                    {
                        label: L("保留已装", "保留已裝", "Keep mods", "装着MODを保持", "장착 모드 유지", "Garder les mods"),
                        value: L("逐件", "逐件", "Per slot", "スロット単位", "슬롯별", "Par emplacement"),
                    },
                    {
                        label: L("MOD 类型", "MOD 類型", "Mod types", "MODタイプ", "모드 유형", "Types de mods"),
                        value: L(
                            "角色 · 近战 · 远程",
                            "角色 · 近戰 · 遠程",
                            "Character · Melee · Ranged",
                            "キャラ・近接・遠隔",
                            "캐릭터 · 근접 · 원거리",
                            "Personnage · Mêlée · Distance"
                        ),
                    },
                ],
                logs: [
                    {
                        at: 1.2,
                        text: L(
                            "开始：当前目标值 1,284,900",
                            "開始：目前目標值 1,284,900",
                            "Start: current target 1,284,900",
                            "開始：現在の目標値 1,284,900",
                            "시작: 현재 목표값 1,284,900",
                            "Départ : cible actuelle 1 284 900"
                        ),
                    },
                    {
                        at: 2.8,
                        text: L(
                            "第 3 次迭代：添加 攻势 (+6.2%)",
                            "第 3 次迭代：新增 攻勢 (+6.2%)",
                            "Iteration 3: add Offensive (+6.2%)",
                            "第3反復：攻勢を追加 (+6.2%)",
                            "3회차: 공세 추가 (+6.2%)",
                            "Itération 3 : ajout Offensive (+6,2 %)"
                        ),
                    },
                    {
                        at: 4.6,
                        text: L(
                            "第 7 次迭代：替换 重压 → 锋锐 (+3.1%)",
                            "第 7 次迭代：替換 重壓 → 鋒銳 (+3.1%)",
                            "Iteration 7: swap Pressure → Keen (+3.1%)",
                            "第7反復：重圧 → 鋭鋒 (+3.1%)",
                            "7회차: 중압 → 예리 (+3.1%)",
                            "Itération 7 : Pression → Tranchant (+3,1 %)"
                        ),
                    },
                    {
                        at: 6.4,
                        text: L(
                            "第 12 次迭代：无可提升项，停止",
                            "第 12 次迭代：無可提升項，停止",
                            "Iteration 12: no upgrade left, stop",
                            "第12反復：改善なし、停止",
                            "12회차: 개선 항목 없음, 중지",
                            "Itération 12 : plus d'amélioration, arrêt"
                        ),
                    },
                ],
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "打开自动构筑就开始算；默认 MOD 类型一个都没勾。",
                        "開啟自動構築就開始算；預設 MOD 類型一個都沒勾。",
                        "Auto-build starts calculating on open; by default no mod type is checked.",
                        "自動構築は開いた瞬間から計算。初期状態ではMODタイプが未選択です。",
                        "자동 빌드는 열자마자 계산합니다. 기본적으로 모드 유형은 선택돼 있지 않습니다.",
                        "L'auto-build calcule dès l'ouverture ; par défaut, aucun type de mod n'est coché."
                    ),
                },
                {
                    at: 5.8,
                    text: L(
                        "先勾角色、近战、远程，再决定只用库存和逐件保留。",
                        "先勾角色、近戰、遠程，再決定只用庫存和逐件保留。",
                        "Check character, melee, and ranged first, then choose inventory-only and per-slot preservation.",
                        "まずキャラ・近接・遠隔を選び、在庫限定とスロット保持を決めます。",
                        "캐릭터, 근접, 원거리를 먼저 선택하고 재고만 사용할지, 슬롯별 보존할지 정하세요.",
                        "Cochez personnage, mêlée et distance, puis choisissez stock seul et préservation par emplacement."
                    ),
                },
            ],
            callouts: [
                {
                    at: 0.9,
                    text: L("当前值 → 新值", "目前值 → 新值", "Current → new", "現在 → 新", "현재 → 신규", "Actuel → nouveau"),
                    x: 50,
                    y: 26,
                },
                {
                    at: 5.6,
                    text: L("实时日志", "即時日誌", "Live log", "リアルタイムログ", "실시간 로그", "Journal en direct"),
                    x: 72,
                    y: 74,
                },
            ],
            cursor: {
                at: 1.2,
                path: [
                    [24, 46],
                    [28, 42],
                    [32, 38],
                ],
                clickAt: 3.0,
            },
            note: L("自动构筑", "自動構築", "Auto-build", "自動構築", "자동 빌드", "Auto-build"),
        },
        {
            id: "auto-boundary",
            chapter: L("应用边界", "應用邊界", "Apply boundary", "適用範囲", "적용 범위", "Portée de l'application"),
            duration: 9.5,
            shot: {
                type: "callout",
                kicker: "APPLY",
                title: L(
                    "应用只改装配",
                    "應用只改裝配",
                    "Apply changes the loadout only",
                    "適用するのは装備だけ",
                    "적용은 장비만 변경",
                    "Appliquer ne touche qu'à l'équipement"
                ),
                icon: "ri:robot-2-line",
                points: [
                    {
                        icon: "ri:sword-line",
                        text: L(
                            "只写入武器与当前激活的 MOD 变体",
                            "只寫入武器與目前啟用的 MOD 變體",
                            "Writes only the weapon and the active mod variant",
                            "武器と現在有効なMOD変種だけを書き込みます",
                            "무기와 현재 활성 모드 변형만 기록합니다",
                            "N'écrit que l'arme et la variante de mod active"
                        ),
                    },
                    {
                        icon: "ri:shield-line",
                        text: L(
                            "光环、BUFF、队友、敌人保持原样",
                            "光環、BUFF、隊友、敵人保持原樣",
                            "Aura, buffs, teammates, and enemy stay as they are",
                            "オーラ・BUFF・仲間・敵はそのまま",
                            "오라, 버프, 동료, 적은 그대로",
                            "Aura, buffs, équipiers et ennemi restent inchangés"
                        ),
                    },
                    {
                        icon: "ri:information-line",
                        text: L(
                            "日志逐行显示添加、替换与收益，可复制诊断",
                            "日誌逐行顯示新增、替換與收益，可複製診斷",
                            "The log lists adds, swaps, and gains line by line; diagnostics can be copied",
                            "ログは追加・置換・効果を行ごとに表示し、診断をコピーできます",
                            "로그는 추가, 교체, 이득을 줄마다 보여주며 진단을 복사할 수 있습니다",
                            "Le journal détaille ajouts, remplacements et gains ; le diagnostic se copie"
                        ),
                    },
                ],
                note: L(
                    "默认不勾类型时，结果几乎等于当前构筑",
                    "預設不勾類型時，結果幾乎等於目前構築",
                    "With no type checked, the result barely differs from the current build",
                    "タイプ未選択なら結果はほぼ現状のまま",
                    "유형을 선택하지 않으면 결과는 거의 그대로입니다",
                    "Sans type coché, le résultat reste proche du build actuel"
                ),
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "「应用」只写武器和当前激活的 MOD 变体。",
                        "「應用」只寫武器和目前啟用的 MOD 變體。",
                        "Apply writes only the weapon and the active mod variant.",
                        "「適用」は武器と現在有効なMOD変種だけを書き込みます。",
                        "'적용'은 무기와 현재 활성 모드 변형만 기록합니다.",
                        "« Appliquer » n'écrit que l'arme et la variante de mod active."
                    ),
                },
                {
                    at: 5.4,
                    text: L(
                        "光环、BUFF、队友、敌人都不动；不勾类型时结果几乎不变。",
                        "光環、BUFF、隊友、敵人全部保持原樣；不勾類型時結果幾乎不變。",
                        "Aura, buffs, teammates, and enemy stay untouched; with no type checked, little changes.",
                        "オーラ・BUFF・仲間・敵はそのまま。タイプ未選択なら結果はほぼ変わりません。",
                        "오라, 버프, 동료, 적은 그대로입니다. 유형을 선택하지 않으면 거의 변하지 않습니다.",
                        "Aura, buffs, équipiers et ennemi restent intacts ; sans type coché, peu de choses changent."
                    ),
                },
            ],
        },
        {
            id: "compare",
            chapter: L("构筑对比", "構築對比", "Build comparison", "構築比較", "빌드 비교", "Comparaison de builds"),
            duration: 11,
            shot: {
                type: "compare",
                kicker: "COMPARE",
                title: L(
                    "多套方案并排",
                    "多套方案並排",
                    "Configurations side by side",
                    "複数プランを並べて比較",
                    "여러 설정을 나란히",
                    "Plusieurs configurations côte à côte"
                ),
                left: {
                    title: L(
                        "方案 A · 当前配置",
                        "方案 A · 目前設定",
                        "Config A · Current",
                        "プラン A · 現在の設定",
                        "설정 A · 현재",
                        "Config A · Actuelle"
                    ),
                    subtitle: L("赛琪 · 风伤", "賽琪 · 風傷", "Saiqi · Wind", "サイキ · 風", "사이치 · 바람", "Saiqi · Vent"),
                    stats: [
                        { label: L("目标值", "目標值", "Target", "目標値", "목표값", "Cible"), value: "1,284,900" },
                        { label: L("增伤", "增傷", "DMG bonus", "ダメ増加", "피해 증가", "Bonus DGT"), value: "+86.2%" },
                        { label: L("暴击率", "暴擊率", "Crit rate", "会心率", "치명타율", "Taux crit"), value: "62.4%" },
                    ],
                    accent: true,
                },
                right: {
                    title: L(
                        "方案 B · 换武器",
                        "方案 B · 換武器",
                        "Config B · New weapon",
                        "プラン B · 武器変更",
                        "설정 B · 무기 교체",
                        "Config B · Nouvelle arme"
                    ),
                    subtitle: L(
                        "同一角色 · 换武器",
                        "同一角色 · 換武器",
                        "Same character · new weapon",
                        "同じキャラ・武器変更",
                        "같은 캐릭터 · 무기 교체",
                        "Même personnage · nouvelle arme"
                    ),
                    stats: [
                        { label: L("目标值", "目標值", "Target", "目標値", "목표값", "Cible"), value: "1,562,300" },
                        { label: L("增伤", "增傷", "DMG bonus", "ダメ増加", "피해 증가", "Bonus DGT"), value: "+102.4%" },
                        { label: L("暴击率", "暴擊率", "Crit rate", "会心率", "치명타율", "Taux crit"), value: "66.1%" },
                    ],
                },
                delta: {
                    label: L("伤害差值", "傷害差值", "Damage delta", "ダメージ差", "피해 차이", "Écart de dégâts"),
                    value: "+21.6%",
                    positive: true,
                },
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "配置卡可以复制，并排看三套方案。",
                        "設定卡可以複製，並排看三套方案。",
                        "Duplicate config cards and view three side by side.",
                        "設定カードを複製し、3つを並べて比較できます。",
                        "설정 카드를 복제해 세 개를 나란히 볼 수 있습니다.",
                        "Dupliquez les cartes et affichez trois configurations côte à côte."
                    ),
                },
                {
                    at: 5.6,
                    text: L(
                        "改任意一侧立即重算；表头取第一张配置的技能。",
                        "改任意一側立即重算；表頭取第一張設定的技能。",
                        "Editing either side recalculates instantly; the header uses the first config's skill.",
                        "どちらかを変えると即再計算。ヘッダーのスキルは最初の設定から取ります。",
                        "어느 쪽을 바꿔도 즉시 재계산되며, 헤더 스킬은 첫 설정을 따릅니다.",
                        "Modifier un côté recalcule aussitôt ; l'en-tête reprend la compétence de la première config."
                    ),
                },
            ],
            callouts: [
                {
                    at: 2.2,
                    text: L("复制配置", "複製設定", "Duplicate config", "設定を複製", "설정 복제", "Dupliquer la config"),
                    x: 22,
                    y: 20,
                },
                {
                    at: 6.8,
                    text: L("实时重算", "即時重算", "Live recalc", "即時再計算", "실시간 재계산", "Recalcul en direct"),
                    x: 64,
                    y: 58,
                },
            ],
            cursor: {
                at: 1.0,
                path: [
                    [18, 18],
                    [21, 19],
                    [23, 20],
                ],
                clickAt: 2.2,
            },
        },
        {
            id: "compare-caveat",
            chapter: L("对比边界", "對比邊界", "Compare caveats", "比較の注意点", "비교 주의점", "Limites de la comparaison"),
            duration: 8.5,
            shot: {
                type: "callout",
                kicker: "CAVEAT",
                title: L(
                    "对比页不存盘",
                    "對比頁不存盤",
                    "Comparison is not saved",
                    "比較ページは保存されません",
                    "비교 페이지는 저장되지 않습니다",
                    "La comparaison n'est pas sauvegardée"
                ),
                icon: "ri:error-warning-line",
                points: [
                    {
                        icon: "ri:refresh-line",
                        text: L(
                            "刷新即重置，页面明写不会自动保存",
                            "重新整理即重置，頁面明寫不會自動儲存",
                            "Refresh resets it; the page states it does not auto-save",
                            "更新するとリセット。自動保存しないと明記されています",
                            "새로고침하면 초기화됩니다. 자동 저장 안 됨이 명시돼 있습니다",
                            "Un rafraîchissement remet tout à zéro ; la page indique qu'elle n'enregistre pas"
                        ),
                    },
                    {
                        icon: "ri:filter-line",
                        text: L(
                            "项目下拉与构筑页口径不一致，保存项目未必出现",
                            "專案下拉與構築頁口徑不一致，儲存專案未必出現",
                            "The project dropdown differs from the build page, so saved projects may not appear",
                            "プロジェクト選択は構築ページと基準が違い、保存済みが出ないことがあります",
                            "프로젝트 드롭다운은 빌드 페이지와 기준이 달라 저장된 프로젝트가 안 보일 수 있습니다",
                            "La liste de projets diffère de la page de build ; un projet enregistré peut ne pas apparaître"
                        ),
                    },
                    {
                        icon: "ri:download-2-line",
                        text: L(
                            "请先载入当前配置或分享构筑",
                            "請先載入目前設定或分享構築",
                            "Load the current config or a shared build first",
                            "現在の設定か共有構築を読み込んでください",
                            "현재 설정이나 공유 빌드를 먼저 불러오세요",
                            "Chargez d'abord la configuration actuelle ou un build partagé"
                        ),
                    },
                ],
                note: L(
                    "别把项目下拉当存档",
                    "別把專案下拉當存檔",
                    "Do not treat the project dropdown as a save",
                    "プロジェクト選択をセーブ扱いしないでください",
                    "프로젝트 드롭다운을 저장으로 오해하지 마세요",
                    "Ne prenez pas la liste de projets pour une sauvegarde"
                ),
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "对比结果不会保存，刷新就回到初始状态。",
                        "對比結果不會儲存，重新整理就回到初始狀態。",
                        "Comparison results are not saved; a refresh returns to the initial state.",
                        "比較結果は保存されず、更新すると初期状態に戻ります。",
                        "비교 결과는 저장되지 않으며 새로고침하면 초기 상태로 돌아갑니다.",
                        "Les résultats ne sont pas sauvegardés ; un rafraîchissement réinitialise la page."
                    ),
                },
                {
                    at: 4.8,
                    text: L(
                        "项目下拉口径不一致，用当前配置或分享构筑载入。",
                        "專案下拉口徑不一致，用目前設定或分享構築載入。",
                        "The project dropdown is inconsistent; load the current config or a shared build.",
                        "プロジェクト選択は基準が違うため、現在の設定か共有構築を読み込みます。",
                        "프로젝트 드롭다운 기준이 달라 현재 설정이나 공유 빌드로 불러오세요.",
                        "La liste de projets est incohérente ; chargez la config actuelle ou un build partagé."
                    ),
                },
            ],
        },
        {
            id: "levelup",
            chapter: L("养成计算", "養成計算", "Level-up planning", "育成計算", "육성 계산", "Planification de progression"),
            duration: 11,
            shot: {
                type: "dashboard",
                kicker: "LEVEL UP",
                title: L(
                    "养成：资源与时间",
                    "養成：資源與時間",
                    "Level-up: resources and time",
                    "育成：資源と時間",
                    "육성: 자원과 시간",
                    "Progression : ressources et temps"
                ),
                stats: [
                    { label: L("计划项", "計畫項", "Plan items", "計画項目", "계획 항목", "Éléments"), value: "12", accent: true },
                    { label: L("预计天数", "預計天數", "Estimated days", "予想日数", "예상 일수", "Jours estimés"), value: "6" },
                    { label: L("副本次数", "副本次數", "Runs", "周回数", "던전 횟수", "Runs"), value: "38" },
                    { label: L("总消耗", "總消耗", "Total cost", "総消費", "총 소모", "Coût total"), value: "1.24M" },
                ],
                chart: {
                    kind: "bars",
                    values: [38, 26, 18, 12],
                    labels: [
                        L("等级", "等級", "Level", "レベル", "레벨", "Niveau"),
                        L("技能", "技能", "Skill", "スキル", "스킬", "Compétence"),
                        L("突破", "突破", "Ascend", "突破", "돌파", "Ascension"),
                        L("锻造", "鍛造", "Forge", "鍛造", "단조", "Forge"),
                    ],
                },
                rows: [
                    {
                        label: L(
                            "角色 · Lv.1→80",
                            "角色 · Lv.1→80",
                            "Character · Lv.1→80",
                            "キャラ · Lv.1→80",
                            "캐릭터 · Lv.1→80",
                            "Personnage · Lv.1→80"
                        ),
                        value: L("3 技能", "3 技能", "3 skills", "スキル3", "스킬 3", "3 compétences"),
                        meta: L("计划", "計畫", "Plan", "計画", "계획", "Plan"),
                    },
                    {
                        label: L(
                            "武器 · Lv.1→80",
                            "武器 · Lv.1→80",
                            "Weapon · Lv.1→80",
                            "武器 · Lv.1→80",
                            "무기 · Lv.1→80",
                            "Arme · Lv.1→80"
                        ),
                        value: L("精炼 0→5", "精煉 0→5", "Refine 0→5", "精錬 0→5", "정련 0→5", "Affinage 0→5"),
                        meta: L("计划", "計畫", "Plan", "計画", "계획", "Plan"),
                    },
                    {
                        label: L(
                            "魔之楔 · Lv.1→10",
                            "魔之楔 · Lv.1→10",
                            "Mods · Lv.1→10",
                            "魔之楔 · Lv.1→10",
                            "모드 · Lv.1→10",
                            "Mods · Lv.1→10"
                        ),
                        value: L("数量", "數量", "Count", "数量", "수량", "Quantité"),
                        meta: L("计划", "計畫", "Plan", "計画", "계획", "Plan"),
                    },
                    {
                        label: L("资源过滤", "資源過濾", "Resource filter", "リソース絞り込み", "자원 필터", "Filtre de ressources"),
                        value: L("重算时间", "重算時間", "Recalc time", "時間を再計算", "시간 재계산", "Recalcul du temps"),
                        meta: L(
                            "点击总消耗项",
                            "點擊總消耗項",
                            "Click a total",
                            "総消費をクリック",
                            "총 소모 클릭",
                            "Cliquez sur un total"
                        ),
                    },
                    {
                        label: L("资源关系图", "資源關係圖", "Resource graph", "リソース関係図", "자원 관계도", "Graphe de ressources"),
                        value: L("全屏", "全螢幕", "Full screen", "全画面", "전체 화면", "Plein écran"),
                        meta: L("查看依赖", "查看依賴", "View dependencies", "依存関係を表示", "의존 관계 보기", "Voir les dépendances"),
                    },
                ],
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "养成计算有四个页签：角色、武器、魔之楔、估算配置。",
                        "養成計算有四個頁籤：角色、武器、魔之楔、估算設定。",
                        "Level-up has four tabs: characters, weapons, mods, and estimate settings.",
                        "育成計算は4タブ：キャラ・武器・魔之楔・見積もり設定。",
                        "육성 계산은 네 탭입니다: 캐릭터, 무기, 모드, 예상 설정.",
                        "Le calcul de progression a quatre onglets : personnages, armes, mods, réglages d'estimation."
                    ),
                },
                {
                    at: 5.6,
                    text: L(
                        "资料库「添加到养成」写成本地计划；资源过滤后时间重算。",
                        "資料庫「加入養成」寫成本地計畫；資源過濾後時間重算。",
                        "“Add to level-up” in the database writes a local plan; resource filters recalculate time.",
                        "図鑑の「育成に追加」はローカル計画に保存。リソース絞り込みで時間を再計算します。",
                        "도감의 '육성에 추가'는 로컬 계획으로 저장되며, 자원 필터 후 시간이 재계산됩니다.",
                        "« Ajouter à la progression » crée un plan local ; les filtres de ressources recalculent le temps."
                    ),
                },
            ],
            callouts: [
                { at: 2.0, text: L("四个页签", "四個頁籤", "Four tabs", "4つのタブ", "네 개 탭", "Quatre onglets"), x: 22, y: 18 },
                { at: 6.6, text: L("预计天数", "預計天數", "Estimated days", "予想日数", "예상 일수", "Jours estimés"), x: 70, y: 30 },
            ],
        },
        {
            id: "levelup-boundary",
            chapter: L("养成边界", "養成邊界", "Level-up caveats", "育成の注意点", "육성 주의점", "Limites de progression"),
            duration: 9.5,
            shot: {
                type: "callout",
                kicker: "BOUNDARY",
                title: L(
                    "养成计算的两条边界",
                    "養成計算的兩條邊界",
                    "Two boundaries in level-up",
                    "育成計算の2つの境界",
                    "육성 계산의 두 경계",
                    "Deux limites de progression"
                ),
                icon: "ri:calculator-line",
                points: [
                    {
                        icon: "ri:login-box-line",
                        text: L(
                            "同步角色/武器需要皎皎角账号",
                            "同步角色/武器需要皎皎角帳號",
                            "Syncing characters and weapons needs a Jiaojiao account",
                            "キャラ・武器の同期には皎皎角アカウントが必要",
                            "캐릭터/무기 동기화에는 교교각 계정이 필요합니다",
                            "La synchronisation des personnages et armes exige un compte Jiaojiao"
                        ),
                    },
                    {
                        icon: "ri:inbox-line",
                        text: L(
                            "养成计划与库存不会自动联动",
                            "養成計畫與庫存不會自動聯動",
                            "The level-up plan and inventory do not auto-link",
                            "育成計画と在庫は自動連動しません",
                            "육성 계획과 재고는 자동 연동되지 않습니다",
                            "Le plan de progression et l'inventaire ne se lient pas automatiquement"
                        ),
                    },
                    {
                        icon: "ri:file-transfer-line",
                        text: L(
                            "「开销估算 → 完整计算器」会覆盖 lvup.mods 原计划",
                            "「開銷估算 → 完整計算器」會覆蓋 lvup.mods 原計畫",
                            "The mod cost estimate's full calculator overwrites the existing lvup.mods plan",
                            "MODコスト見積もりの「完全計算機」は既存の lvup.mods 計画を上書きします",
                            "MOD 비용 추정의 '전체 계산기'는 기존 lvup.mods 계획을 덮어씁니다",
                            "Le calculateur complet de l'estimation de coût écrase le plan lvup.mods existant"
                        ),
                    },
                ],
                note: L(
                    "需皎皎角登录",
                    "需皎皎角登入",
                    "Jiaojiao login required",
                    "皎皎角ログインが必要",
                    "교교각 로그인 필요",
                    "Connexion Jiaojiao requise"
                ),
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "同步角色和武器要登录皎皎角；计算本身不用。",
                        "同步角色和武器要登入皎皎角；計算本身不用。",
                        "Syncing characters and weapons needs a Jiaojiao account; calculating does not.",
                        "キャラと武器の同期には皎皎角ログインが必要。計算自体は不要です。",
                        "캐릭터와 무기 동기화에는 교교각 로그인이 필요합니다. 계산 자체는 필요 없습니다.",
                        "Synchroniser personnages et armes exige un compte Jiaojiao ; le calcul, non."
                    ),
                },
                {
                    at: 5.2,
                    text: L(
                        "计划与库存不联动；MOD 开销估算会覆盖原计划。",
                        "計畫與庫存不聯動；MOD 開銷估算會覆蓋原計畫。",
                        "Plans and inventory are not linked; the mod cost estimate overwrites the existing plan.",
                        "計画と在庫は連動しません。MODコスト見積もりは既存計画を上書きします。",
                        "계획과 재고는 연동되지 않으며, MOD 비용 추정은 기존 계획을 덮어씁니다.",
                        "Plan et inventaire ne sont pas liés ; l'estimation de coût des mods écrase le plan existant."
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
                    "把构筑变成决策",
                    "把構築變成決策",
                    "Turn a build into a decision",
                    "構築を意思決定に変える",
                    "빌드를 결정으로 바꾸기",
                    "Transformez un build en décision"
                ),
                checklist: [
                    L(
                        "自动构筑先勾类型；应用只改武器与当前 MOD 变体",
                        "自動構築先勾類型；應用只改武器與目前 MOD 變體",
                        "Check types in auto-build; apply only touches the weapon and active mod variant",
                        "自動構築はタイプを選択。適用は武器と現在のMOD変種だけ",
                        "자동 빌드는 유형을 선택하고, 적용은 무기와 현재 모드 변형만 변경",
                        "Cochez les types ; appliquer ne touche qu'à l'arme et à la variante active"
                    ),
                    L(
                        "对比页可并排三套，实时重算但不存盘",
                        "對比頁可並排三套，即時重算但不存盤",
                        "Compare three configs live, but nothing persists",
                        "比較は3つ並べられ、即時再計算だが保存されない",
                        "비교는 세 개를 나란히, 실시간 재계산이지만 저장 안 됨",
                        "Trois configs côte à côte, recalcul en direct mais sans sauvegarde"
                    ),
                    L(
                        "养成计划是本地的；同步要皎皎角",
                        "養成計畫是本地的；同步要皎皎角",
                        "The level-up plan is local; syncing needs Jiaojiao",
                        "育成計画はローカル。同期には皎皎角が必要",
                        "육성 계획은 로컬이며, 동기화에는 교교각이 필요합니다",
                        "Le plan de progression est local ; la synchronisation exige Jiaojiao"
                    ),
                ],
                route: "/char-build-compare",
                routeLabel: L(
                    "去对比两套方案",
                    "去對比兩套方案",
                    "Compare two builds",
                    "2つの構築を比較",
                    "두 빌드 비교",
                    "Comparer deux builds"
                ),
                hint: L(
                    "下一步：把候选池录进库存",
                    "下一步：把候選池錄進庫存",
                    "Next: record your candidate pool in inventory",
                    "次へ：候補プールを在庫に登録",
                    "다음: 후보 풀을 재고에 등록",
                    "Ensuite : enregistrez votre vivier dans l'inventaire"
                ),
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "现在，用数据决定下一套构筑。",
                        "現在，用數據決定下一套構築。",
                        "Now let the numbers choose your next build.",
                        "さあ、データで次の構築を決めましょう。",
                        "이제 데이터로 다음 빌드를 결정하세요.",
                        "Laissez les chiffres choisir votre prochain build."
                    ),
                },
            ],
        },
    ],
}
