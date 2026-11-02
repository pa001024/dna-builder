import { L, type Tutorial } from "../types"

export const inventoryAchievementTutorial: Tutorial = {
    id: "inventory-achievement",
    number: "04",
    category: "plan",
    title: L("库存与成就", "庫存與成就", "Inventory & Achievements", "在庫と実績", "재고와 업적", "Inventaire et succès"),
    subtitle: L(
        "候选池与本机清单",
        "候選池與本機清單",
        "The candidate pool and the local list",
        "候補プールとローカルリスト",
        "후보 풀과 로컬 목록",
        "Le vivier et la liste locale"
    ),
    summary: L(
        "仓库决定构筑能用什么，成就记录你完成了什么；两边都只存在本机。",
        "倉庫決定構築能用什麼，成就記錄你完成了什麼；兩邊都只存在本機。",
        "Inventory defines what a build can use; achievements record what you finished. Both live on this machine.",
        "在庫は構築で使えるものを決め、実績は達成を記録します。どちらもローカル保存です。",
        "재고는 빌드가 쓸 수 있는 것을 정하고, 업적은 완료한 것을 기록합니다. 둘 다 로컬에 저장됩니다.",
        "L'inventaire définit ce qu'un build peut utiliser ; les succès notent ce que vous avez terminé. Les deux restent en local."
    ),
    icon: "ri:box-1-line",
    accent: "#43e97b",
    route: "/inventory",
    routeLabel: L("打开库存管理", "開啟庫存管理", "Open Inventory", "在庫管理を開く", "재고 관리 열기", "Ouvrir l'inventaire"),
    platforms: ["web", "dna"],
    scenes: [
        {
            id: "intro",
            chapter: L("开场", "開場", "Intro", "導入", "인트로", "Intro"),
            duration: 5,
            shot: {
                type: "title",
                variant: "intro",
                kicker: L("EP 04 · 规划", "EP 04 · 規劃", "EP 04 · PLAN", "EP 04 · 計画", "EP 04 · 계획", "EP 04 · PLAN"),
                title: L("库存与成就", "庫存與成就", "Inventory & Achievements", "在庫と実績", "재고와 업적", "Inventaire et succès"),
                subtitle: L(
                    "先定义你拥有什么，再记录你完成了什么。",
                    "先定義你擁有什麼，再記錄你完成了什麼。",
                    "Define what you own, then record what you finished.",
                    "何を持っているかを定め、何を達成したかを記録する。",
                    "무엇을 가졌는지 정하고, 무엇을 완료했는지 기록합니다.",
                    "Définissez ce que vous possédez, puis notez ce que vous avez terminé."
                ),
                icon: "ri:box-1-line",
                index: "04",
            },
            captions: [
                {
                    at: 0.9,
                    text: L(
                        "这一集讲两件事：构筑的候选池，和本地的成就清单。",
                        "這一集講兩件事：構築的候選池，和本地的成就清單。",
                        "Two things here: the candidate pool behind a build, and a local achievement list.",
                        "この回は2つ。構築の候補プールと、ローカルの実績リストです。",
                        "이번 편은 두 가지입니다. 빌드의 후보 풀과 로컬 업적 목록입니다.",
                        "Deux sujets : le vivier derrière un build, et une liste de succès locale."
                    ),
                },
            ],
        },
        {
            id: "sync-mode",
            chapter: L("同步游戏", "同步遊戲", "Sync game", "ゲーム同期", "게임 동기화", "Synchronisation"),
            duration: 10,
            shot: {
                type: "modal",
                title: L(
                    "选择同步模式",
                    "選擇同步模式",
                    "Choose sync mode",
                    "同期モードを選択",
                    "동기화 모드 선택",
                    "Choisir le mode de synchronisation"
                ),
                description: L(
                    "同步游戏从账号读取已解锁武器；含魔之楔的模式会再扫描装备。",
                    "同步遊戲從帳號讀取已解鎖武器；含魔之楔的模式會再掃描裝備。",
                    "Sync reads unlocked weapons from your account; mod modes also scan equipped mods.",
                    "同期はアカウントから解放済み武器を読み取り、MODモードでは装着中も走査します。",
                    "동기화는 계정에서 해금된 무기를 읽고, 모드 모드에서는 장착 중인 모드도 스캔합니다.",
                    "La synchro lit les armes débloquées du compte ; les modes avec mods scannent aussi l'équipement."
                ),
                options: [
                    {
                        label: L("仅武器", "僅武器", "Weapons only", "武器のみ", "무기만", "Armes seulement"),
                        desc: L(
                            "同步已解锁的近战与远程武器",
                            "同步已解鎖的近戰與遠程武器",
                            "Sync unlocked melee and ranged weapons",
                            "解放済みの近接・遠距離武器を同期",
                            "해금된 근접·원거리 무기 동기화",
                            "Synchroniser les armes de mêlée et à distance débloquées"
                        ),
                        icon: "ri:sword-line",
                    },
                    {
                        label: L(
                            "武器和角色魔之楔",
                            "武器和角色魔之楔",
                            "Weapons + character mods",
                            "武器とキャラ魔之楔",
                            "무기 + 캐릭터 모드",
                            "Armes + mods de personnage"
                        ),
                        desc: L(
                            "再扫描每个角色当前装备的魔之楔",
                            "再掃描每個角色目前裝備的魔之楔",
                            "Also scan mods currently equipped by each character",
                            "各キャラが現在装着している魔之楔も走査",
                            "각 캐릭터가 현재 장착한 모드도 스캔",
                            "Scanner aussi les mods équipés par chaque personnage"
                        ),
                        icon: "ri:puzzle-line",
                    },
                    {
                        label: L(
                            "武器和角色武器魔之楔",
                            "武器和角色武器魔之楔",
                            "Weapons + character & weapon mods",
                            "武器とキャラ・武器魔之楔",
                            "무기 + 캐릭터·무기 모드",
                            "Armes + mods de personnage et d'arme"
                        ),
                        desc: L(
                            "连同角色已装备武器的魔之楔",
                            "連同角色已裝備武器的魔之楔",
                            "Include mods on weapons equipped by characters",
                            "キャラ装着武器の魔之楔も含める",
                            "캐릭터 장착 무기의 모드도 포함",
                            "Inclure les mods des armes équipées par les personnages"
                        ),
                        icon: "ri:box-1-line",
                        active: true,
                    },
                ],
                actions: [L("取消", "取消", "Cancel", "キャンセル", "취소", "Annuler")],
                result: {
                    title: L("同步完成", "同步完成", "Sync complete", "同期完了", "동기화 완료", "Synchronisation terminée"),
                    value: L(
                        "库存同步成功",
                        "庫存同步成功",
                        "Inventory synced",
                        "在庫同期成功",
                        "재고 동기화 성공",
                        "Inventaire synchronisé"
                    ),
                    hint: L(
                        "只含当前已装备的魔之楔",
                        "只含目前裝備的魔之楔",
                        "Includes only currently equipped mods",
                        "現在装着中の魔之楔のみ",
                        "현재 장착 중인 모드만 포함",
                        "Uniquement les mods actuellement équipés"
                    ),
                },
                confirmAt: 2.0,
                resultAt: 3.6,
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "同步游戏有三种模式：只同步武器，或带上角色/武器魔之楔。",
                        "同步遊戲有三種模式：只同步武器，或帶上角色/武器魔之楔。",
                        "Sync has three modes: weapons only, plus character mods, or plus weapon mods.",
                        "同期は3モード：武器のみ、キャラ魔之楔付き、武器魔之楔付き。",
                        "동기화는 세 가지입니다: 무기만, 캐릭터 모드 포함, 무기 모드 포함.",
                        "Trois modes : armes seules, avec mods de personnage, ou avec mods d'arme."
                    ),
                },
                {
                    at: 5.6,
                    text: L(
                        "含魔之楔的模式会先确认，耗时随角色数量增加。",
                        "含魔之楔的模式會先確認，耗時隨角色數量增加。",
                        "Mod modes ask for confirmation first; scanning grows with character count.",
                        "魔之楔を含むモードは確認後、キャラ数に比例して時間がかかります。",
                        "모드 포함 모드는 먼저 확인하며, 캐릭터 수에 비례해 오래 걸립니다.",
                        "Les modes avec mods demandent confirmation ; la durée croît avec le nombre de personnages."
                    ),
                },
            ],
            cursor: {
                at: 1.0,
                path: [
                    [58, 40],
                    [56, 50],
                    [55, 58],
                ],
                clickAt: 2.0,
            },
            note: L("需皎皎角", "需皎皎角", "Jiaojiao account", "皎皎角が必要", "교교각 필요", "Compte Jiaojiao"),
        },
        {
            id: "equipped-only",
            chapter: L("同步口径", "同步口徑", "Sync semantics", "同期の範囲", "동기화 기준", "Portée de la synchro"),
            duration: 9,
            shot: {
                type: "callout",
                kicker: "SYNC TRUTH",
                title: L(
                    "只同步已装备",
                    "只同步已裝備",
                    "Only equipped gear syncs",
                    "装着中のものだけ同期",
                    "장착 중인 것만 동기화",
                    "Seul l'équipement porté est synchronisé"
                ),
                icon: "ri:information-line",
                points: [
                    {
                        icon: "ri:sword-line",
                        text: L(
                            "武器只取已解锁的，不是全部图鉴",
                            "武器只取已解鎖的，不是全部圖鑑",
                            "Only unlocked weapons are taken, not the whole catalog",
                            "武器は解放済みのみ。図鑑全体ではありません",
                            "무기는 해금된 것만 가져오며 전체 도감은 아닙니다",
                            "Seules les armes débloquées sont prises, pas tout le catalogue"
                        ),
                    },
                    {
                        icon: "ri:puzzle-line",
                        text: L(
                            "魔之楔只读当前穿戴，不读背包",
                            "魔之楔只讀目前穿戴，不讀背包",
                            "Mods are read from current equipment, not the bag",
                            "魔之楔は現在の装着のみ。カバンは読みません",
                            "모드는 현재 장착만 읽고 가방은 읽지 않습니다",
                            "Les mods viennent de l'équipement actuel, pas du sac"
                        ),
                    },
                    {
                        icon: "ri:filter-line",
                        text: L(
                            "同步后筛选不会自动打开",
                            "同步後篩選不會自動開啟",
                            "Filters do not open automatically after syncing",
                            "同期後もフィルターは自動で開きません",
                            "동기화 후 필터는 자동으로 열리지 않습니다",
                            "Les filtres ne s'ouvrent pas automatiquement après la synchro"
                        ),
                    },
                ],
                note: L(
                    "需皎皎角账号",
                    "需皎皎角帳號",
                    "Jiaojiao account required",
                    "皎皎角アカウントが必要",
                    "교교각 계정 필요",
                    "Compte Jiaojiao requis"
                ),
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "同步读取的不是背包，而是角色和武器当前已装备的魔之楔。",
                        "同步讀取的不是背包，而是角色和武器目前裝備的魔之楔。",
                        "Sync does not read your bag; it reads mods currently equipped on characters and weapons.",
                        "同期が読むのはカバンではなく、キャラと武器の現在の装着魔之楔です。",
                        "동기화는 가방이 아니라 캐릭터와 무기에 현재 장착된 모드를 읽습니다.",
                        "La synchro ne lit pas le sac, mais les mods équipés sur les personnages et armes."
                    ),
                },
                {
                    at: 5.2,
                    text: L(
                        "同步完筛选还是关的，网格可能仍然空着。",
                        "同步完篩選還是關的，網格可能仍然空著。",
                        "Filters stay closed after syncing, so the grid may still look empty.",
                        "同期後もフィルターは閉じたままなので、グリッドが空に見えることがあります。",
                        "동기화 후에도 필터가 닫혀 있어 그리드가 비어 보일 수 있습니다.",
                        "Les filtres restent fermés après la synchro ; la grille peut sembler vide."
                    ),
                },
            ],
        },
        {
            id: "inventory-filters",
            chapter: L("库存筛选", "庫存篩選", "Inventory filters", "在庫フィルター", "재고 필터", "Filtres d'inventaire"),
            duration: 11,
            shot: {
                type: "cards",
                kicker: "INVENTORY",
                title: L(
                    "筛选打开，库存才出现",
                    "篩選開啟，庫存才出現",
                    "Open a filter to see inventory",
                    "フィルターを開くと在庫が見える",
                    "필터를 열어야 재고가 보입니다",
                    "Ouvrez un filtre pour voir l'inventaire"
                ),
                variant: "checklist",
                toolbar: {
                    tabs: [L("武器", "武器", "Weapons", "武器", "무기", "Armes"), L("魔之楔", "魔之楔", "Mods", "魔之楔", "모드", "Mods")],
                    activeTab: 0,
                    actions: [
                        L("全选", "全選", "Select all", "全選択", "전체 선택", "Tout sélectionner"),
                        L("取消全选", "取消全選", "Clear", "選択解除", "선택 해제", "Tout désélectionner"),
                    ],
                },
                items: [
                    {
                        title: L("近战", "近戰", "Melee", "近接", "근접", "Mêlée"),
                        subtitle: L("类型开关", "類型開關", "Type toggle", "タイプ切替", "유형 토글", "Filtre de type"),
                        icon: "ri:sword-line",
                        tag: L("类型", "類型", "Type", "タイプ", "유형", "Type"),
                        meta: "OFF",
                    },
                    {
                        title: L("远程", "遠程", "Ranged", "遠隔", "원거리", "Distance"),
                        subtitle: L("类型开关", "類型開關", "Type toggle", "タイプ切替", "유형 토글", "Filtre de type"),
                        icon: "ri:crosshair-line",
                        tag: L("类型", "類型", "Type", "タイプ", "유형", "Type"),
                        meta: "OFF",
                    },
                    {
                        title: L("金", "金", "Gold", "金", "금", "Or"),
                        subtitle: L("品质筛选", "品質篩選", "Quality filter", "品質フィルター", "품질 필터", "Filtre de rareté"),
                        icon: "ri:star-line",
                        tag: L("品质", "品質", "Quality", "品質", "품질", "Rareté"),
                        meta: "OFF",
                        accent: "#fbbf24",
                    },
                    {
                        title: L("紫", "紫", "Purple", "紫", "보라", "Violet"),
                        subtitle: L("品质筛选", "品質篩選", "Quality filter", "品質フィルター", "품질 필터", "Filtre de rareté"),
                        icon: "ri:star-line",
                        tag: L("品质", "品質", "Quality", "品質", "품질", "Rareté"),
                        meta: "OFF",
                        accent: "#c084fc",
                    },
                    {
                        title: L("蓝", "藍", "Blue", "青", "파랑", "Bleu"),
                        subtitle: L("品质筛选", "品質篩選", "Quality filter", "品質フィルター", "품질 필터", "Filtre de rareté"),
                        icon: "ri:star-line",
                        tag: L("品质", "品質", "Quality", "品質", "품질", "Rareté"),
                        meta: "OFF",
                        accent: "#38bdf8",
                    },
                    {
                        title: L("绿", "綠", "Green", "緑", "초록", "Vert"),
                        subtitle: L("品质筛选", "品質篩選", "Quality filter", "品質フィルター", "품질 필터", "Filtre de rareté"),
                        icon: "ri:star-line",
                        tag: L("品质", "品質", "Quality", "品質", "품질", "Rareté"),
                        meta: "OFF",
                        accent: "#4ade80",
                    },
                    {
                        title: L("白", "白", "White", "白", "흰색", "Blanc"),
                        subtitle: L("品质筛选", "品質篩選", "Quality filter", "品質フィルター", "품질 필터", "Filtre de rareté"),
                        icon: "ri:star-line",
                        tag: L("品质", "品質", "Quality", "品質", "품질", "Rareté"),
                        meta: "OFF",
                        accent: "#e5e7eb",
                    },
                    {
                        title: L("契约者", "契約者", "Contractor", "契約者", "계약자", "Contractant"),
                        subtitle: L("数量可调", "數量可調", "Adjustable count", "数量を調整", "수량 조절", "Quantité ajustable"),
                        icon: "ri:group-line",
                        tag: L("数量", "數量", "Count", "数量", "수량", "Quantité"),
                        meta: "1–8",
                        accent: "#43e97b",
                    },
                ],
                columns: 4,
                highlight: 7,
                highlightAt: 4.8,
                highlightLabel: L("数量 1–8", "數量 1–8", "Count 1–8", "数量 1–8", "수량 1–8", "Quantité 1–8"),
                footnote: L(
                    "「已选择所有」不是全选，是筛选未开",
                    "「已選擇所有」不是全選，是篩選未開",
                    "“All selected” means no filter is open, not that everything is checked",
                    "「すべて選択済み」は全選択ではなく、フィルター未開放です",
                    "'모두 선택됨'은 전체 선택이 아니라 필터가 닫힌 상태입니다",
                    "« Tout sélectionné » signifie qu'aucun filtre n'est ouvert, pas que tout est coché"
                ),
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "首次进入两个区域都是空的；「已选择所有」其实是筛选没开。",
                        "首次進入兩個區域都是空的；「已選擇所有」其實是篩選沒開。",
                        "On first visit both grids are empty; “all selected” actually means no filter is open.",
                        "初回は両方のグリッドが空。「すべて選択済み」はフィルター未開放という意味です。",
                        "처음에는 두 영역이 비어 있습니다. '모두 선택됨'은 필터가 닫힌 상태입니다.",
                        "À la première visite, les deux grilles sont vides ; « tout sélectionné » veut dire aucun filtre ouvert."
                    ),
                },
                {
                    at: 5.6,
                    text: L(
                        "打开类型和品质筛选；契约者数量可调 1–8。",
                        "開啟類型和品質篩選；契約者數量可調 1–8。",
                        "Turn on type and quality filters; Contractor count ranges 1–8.",
                        "タイプと品質フィルターを開くと表示。契約者の数量は1–8です。",
                        "유형과 품질 필터를 켜세요. 계약자 수량은 1–8입니다.",
                        "Activez les filtres de type et de rareté ; le Contractant va de 1 à 8."
                    ),
                },
            ],
            callouts: [
                {
                    at: 2.2,
                    text: L("默认关闭", "預設關閉", "Off by default", "初期状態はオフ", "기본 꺼짐", "Désactivé par défaut"),
                    x: 18,
                    y: 26,
                },
                { at: 6.4, text: L("契约者 ×8", "契約者 ×8", "Contractor ×8", "契約者 ×8", "계약자 ×8", "Contractant ×8"), x: 72, y: 62 },
            ],
            note: L("本地库存", "本地庫存", "Local inventory", "ローカル在庫", "로컬 재고", "Inventaire local"),
        },
        {
            id: "inventory-boundary",
            chapter: L("库存定位", "庫存定位", "Inventory role", "在庫の役割", "재고 역할", "Rôle de l'inventaire"),
            duration: 8.5,
            shot: {
                type: "callout",
                kicker: "CANDIDATE POOL",
                title: L(
                    "它是候选池，不是背包",
                    "它是候選池，不是背包",
                    "A candidate pool, not a bag",
                    "バッグではなく候補プール",
                    "가방이 아니라 후보 풀",
                    "Un vivier de candidats, pas un sac"
                ),
                icon: "ri:box-1-line",
                points: [
                    {
                        icon: "ri:hammer-line",
                        text: L(
                            "构筑、自动构筑、时间轴都从库存取候选与等级上限",
                            "構築、自動構築、時間軸都從庫存取候選與等級上限",
                            "Builds, auto-build, and timeline take candidates and level caps from inventory",
                            "構築・自動構築・タイムラインは在庫から候補とレベル上限を取ります",
                            "빌드, 자동 빌드, 타임라인은 재고에서 후보와 레벨 상한을 가져옵니다",
                            "Builds, auto-build et chronologie prennent candidats et plafonds dans l'inventaire"
                        ),
                    },
                    {
                        icon: "ri:download-2-line",
                        text: L(
                            "导入/复制 JSON 只包含武器",
                            "匯入/複製 JSON 只包含武器",
                            "Import/copy JSON contains weapons only",
                            "JSONの読み込み/コピーは武器のみ",
                            "JSON 가져오기/복사는 무기만 포함",
                            "L'import/copie JSON ne contient que des armes"
                        ),
                    },
                    {
                        icon: "ri:file-transfer-line",
                        text: L(
                            "魔之楔、特效、筛选开关不在 JSON 里",
                            "魔之楔、特效、篩選開關不在 JSON 裡",
                            "Mods, effects, and filter toggles are not in the JSON",
                            "魔之楔・エフェクト・フィルターはJSONに含まれません",
                            "모드, 특효, 필터 토글은 JSON에 없습니다",
                            "Mods, effets et filtres ne figurent pas dans le JSON"
                        ),
                    },
                ],
                note: L(
                    "不会写回游戏账号",
                    "不會寫回遊戲帳號",
                    "Never writes back to the game account",
                    "ゲームアカウントには書き戻しません",
                    "게임 계정에 기록하지 않습니다",
                    "N'écrit jamais dans le compte du jeu"
                ),
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "库存决定构筑能用什么、能升到几级，但不会写回游戏。",
                        "庫存決定構築能用什麼、能升到幾級，但不會寫回遊戲。",
                        "Inventory sets what a build can use and its level caps; it never writes back to the game.",
                        "在庫は構築で使えるものとレベル上限を決めますが、ゲームには書き戻しません。",
                        "재고는 빌드가 쓸 수 있는 것과 레벨 상한을 정하지만 게임에 기록하지 않습니다.",
                        "L'inventaire fixe l'usage et les plafonds d'un build ; il n'écrit jamais dans le jeu."
                    ),
                },
                {
                    at: 4.9,
                    text: L(
                        "导入/复制 JSON 只含武器；不含魔之楔、特效和筛选。",
                        "匯入/複製 JSON 只含武器；不含魔之楔、特效和篩選。",
                        "Import/copy JSON covers weapons only; mods, effects, and filters are excluded.",
                        "JSONの読み込み/コピーは武器のみ。魔之楔・エフェクト・フィルターは含まれません。",
                        "JSON 가져오기/복사는 무기만 포함하며, 모드, 특효, 필터는 제외됩니다.",
                        "L'import/copie JSON ne couvre que les armes ; mods, effets et filtres sont exclus."
                    ),
                },
            ],
        },
        {
            id: "achievements",
            chapter: L("成就清单", "成就清單", "Achievement list", "実績リスト", "업적 목록", "Liste de succès"),
            duration: 11,
            shot: {
                type: "cards",
                kicker: "ACHIEVEMENT",
                title: L(
                    "620 条成就，本地打勾",
                    "620 條成就，本地打勾",
                    "620 achievements, checked locally",
                    "620件の実績をローカルでチェック",
                    "620개 업적을 로컬에서 체크",
                    "620 succès cochés en local"
                ),
                variant: "checklist",
                sidebar: {
                    items: [
                        { label: L("所有", "所有", "All", "すべて", "전체", "Tous"), icon: "ri:apps-2-line" },
                        {
                            label: L(
                                "此岸×彼岸",
                                "此岸×彼岸",
                                "This Shore × Other Shore",
                                "此岸×彼岸",
                                "차안×피안",
                                "Ce rivage × l'autre rive"
                            ),
                            icon: "ri:book-open-line",
                        },
                        {
                            label: L(
                                "不止是数字",
                                "不止是數字",
                                "More Than Numbers",
                                "数字だけじゃない",
                                "숫자만이 아니야",
                                "Plus que des chiffres"
                            ),
                            icon: "ri:bar-chart-line",
                        },
                        {
                            label: L("英雄的诞生", "英雄的誕生", "Birth of a Hero", "英雄の誕生", "영웅의 탄생", "Naissance d'un héros"),
                            icon: "ri:trophy-line",
                        },
                    ],
                    active: 2,
                },
                toolbar: {
                    tabs: [L("所有版本", "所有版本", "All versions", "全バージョン", "모든 버전", "Toutes versions")],
                    activeTab: 0,
                    search: L("shengguang", "shengguang", "shengguang", "shengguang", "shengguang", "shengguang"),
                    actions: [
                        L("未完成优先", "未完成優先", "Unfinished first", "未達成優先", "미완료 우선", "Inachevés d'abord"),
                        L("隐藏已完成", "隱藏已完成", "Hide completed", "達成済みを隠す", "완료 숨기기", "Masquer terminés"),
                        L("全选本页", "全選本頁", "Select page", "ページ全選択", "페이지 전체 선택", "Tout sélectionner"),
                    ],
                },
                items: [
                    {
                        title: L(
                            "圣光会护佑你Ⅰ",
                            "聖光會護佑你Ⅰ",
                            "Holy Light Protects You I",
                            "聖光が君を守るⅠ",
                            "성광이 너를 지켜주리Ⅰ",
                            "La lumière sacrée te protège I"
                        ),
                        subtitle: L(
                            "累计造成300000点光属性伤害",
                            "累計造成300000點光屬性傷害",
                            "Deal 300,000 Light damage in total",
                            "累計300000の光属性ダメージ",
                            "누적 300,000 광속성 피해",
                            "Infliger 300 000 dégâts de Lumière au total"
                        ),
                        icon: "ri:trophy-line",
                        tag: L(
                            "不止是数字",
                            "不止是數字",
                            "More Than Numbers",
                            "数字だけじゃない",
                            "숫자만이 아니야",
                            "Plus que des chiffres"
                        ),
                        meta: L("铜币 2000", "銅幣 2000", "Copper 2,000", "銅貨 2,000", "구리화폐 2,000", "Cuivre 2 000"),
                    },
                    {
                        title: L(
                            "天黑请闭眼Ⅰ",
                            "天黑請閉眼Ⅰ",
                            "Close Your Eyes at Night I",
                            "夜になったら目を閉じてⅠ",
                            "어두워지면 눈을 감아Ⅰ",
                            "Ferme les yeux à la nuit I"
                        ),
                        subtitle: L(
                            "累计造成300000点暗属性伤害",
                            "累計造成300000點暗屬性傷害",
                            "Deal 300,000 Dark damage in total",
                            "累計300000の闇属性ダメージ",
                            "누적 300,000 어둠속성 피해",
                            "Infliger 300 000 dégâts de Ténèbres au total"
                        ),
                        icon: "ri:trophy-line",
                        tag: L(
                            "不止是数字",
                            "不止是數字",
                            "More Than Numbers",
                            "数字だけじゃない",
                            "숫자만이 아니야",
                            "Plus que des chiffres"
                        ),
                        meta: L("铜币 2000", "銅幣 2000", "Copper 2,000", "銅貨 2,000", "구리화폐 2,000", "Cuivre 2 000"),
                    },
                    {
                        title: L(
                            "水之不高兴Ⅰ",
                            "水之不高興Ⅰ",
                            "Water Is Unhappy I",
                            "水はご機嫌ななめⅠ",
                            "물이 불만이야Ⅰ",
                            "L'eau n'est pas contente I"
                        ),
                        subtitle: L(
                            "累计造成300000点水属性伤害",
                            "累計造成300000點水屬性傷害",
                            "Deal 300,000 Water damage in total",
                            "累計300000の水属性ダメージ",
                            "누적 300,000 물속성 피해",
                            "Infliger 300 000 dégâts d'Eau au total"
                        ),
                        icon: "ri:trophy-line",
                        tag: L(
                            "不止是数字",
                            "不止是數字",
                            "More Than Numbers",
                            "数字だけじゃない",
                            "숫자만이 아니야",
                            "Plus que des chiffres"
                        ),
                        meta: L("铜币 2000", "銅幣 2000", "Copper 2,000", "銅貨 2,000", "구리화폐 2,000", "Cuivre 2 000"),
                    },
                    {
                        title: L("火之高兴Ⅰ", "火之高興Ⅰ", "Fire Is Happy I", "火はご機嫌Ⅰ", "불이 기뻐Ⅰ", "Le feu est content I"),
                        subtitle: L(
                            "累计造成300000点火属性伤害",
                            "累計造成300000點火屬性傷害",
                            "Deal 300,000 Fire damage in total",
                            "累計300000の火属性ダメージ",
                            "누적 300,000 불속성 피해",
                            "Infliger 300 000 dégâts de Feu au total"
                        ),
                        icon: "ri:trophy-line",
                        tag: L(
                            "不止是数字",
                            "不止是數字",
                            "More Than Numbers",
                            "数字だけじゃない",
                            "숫자만이 아니야",
                            "Plus que des chiffres"
                        ),
                        meta: L("铜币 2000", "銅幣 2000", "Copper 2,000", "銅貨 2,000", "구리화폐 2,000", "Cuivre 2 000"),
                    },
                    {
                        title: L(
                            "斩破次元Ⅰ",
                            "斬破次元Ⅰ",
                            "Pierce the Dimension I",
                            "次元を斬り裂けⅠ",
                            "차원을 베어라Ⅰ",
                            "Fendre la dimension I"
                        ),
                        subtitle: L(
                            "累计造成150000点切割伤害",
                            "累計造成150000點切割傷害",
                            "Deal 150,000 Slash damage in total",
                            "累計150000の斬撃ダメージ",
                            "누적 150,000 절단 피해",
                            "Infliger 150 000 dégâts de Tranchant au total"
                        ),
                        icon: "ri:trophy-line",
                        tag: L(
                            "不止是数字",
                            "不止是數字",
                            "More Than Numbers",
                            "数字だけじゃない",
                            "숫자만이 아니야",
                            "Plus que des chiffres"
                        ),
                        meta: L("铜币 2000", "銅幣 2000", "Copper 2,000", "銅貨 2,000", "구리화폐 2,000", "Cuivre 2 000"),
                    },
                    {
                        title: L(
                            "留你到五更Ⅰ",
                            "留你到五更Ⅰ",
                            "Stay Until Dawn I",
                            "夜明けまで一緒にⅠ",
                            "새벽까지 너를 붙잡아Ⅰ",
                            "Jusqu'à l'aube I"
                        ),
                        subtitle: L(
                            "累计造成5000点治疗",
                            "累計造成5000點治療",
                            "Heal 5,000 HP in total",
                            "累計5000の回復",
                            "누적 5,000 회복",
                            "Soigner 5 000 PV au total"
                        ),
                        icon: "ri:heart-pulse-line",
                        tag: L(
                            "不止是数字",
                            "不止是數字",
                            "More Than Numbers",
                            "数字だけじゃない",
                            "숫자만이 아니야",
                            "Plus que des chiffres"
                        ),
                        meta: L("铜币 2000", "銅幣 2000", "Copper 2,000", "銅貨 2,000", "구리화폐 2,000", "Cuivre 2 000"),
                    },
                ],
                columns: 2,
                highlight: 0,
                highlightAt: 3.0,
                highlightLabel: L("勾选即保存", "勾選即儲存", "Check to save", "チェックで保存", "체크 즉시 저장", "Cocher sauvegarde"),
                footnote: L(
                    "620 条；勾选立即写入本机",
                    "620 條；勾選立即寫入本機",
                    "620 entries; checking writes to this machine immediately",
                    "620件。チェックは即座にローカル保存",
                    "620개. 체크하면 즉시 로컬에 저장",
                    "620 entrées ; cocher enregistre immédiatement en local"
                ),
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "成就有 620 条；勾选立即保存，标题会变删除线。",
                        "成就有 620 條；勾選立即儲存，標題會變刪除線。",
                        "There are 620 achievements; checking one saves instantly and strikes through the title.",
                        "実績は620件。チェックで即保存され、タイトルに取り消し線が入ります。",
                        "업적은 620개입니다. 체크하면 즉시 저장되고 제목에 취소선이 생깁니다.",
                        "Il y a 620 succès ; cocher sauvegarde aussitôt et barre le titre."
                    ),
                },
                {
                    at: 5.6,
                    text: L(
                        "分类、版本、未完成优先、隐藏已完成和拼音搜索可以叠加。",
                        "分類、版本、未完成優先、隱藏已完成和拼音搜尋可以疊加。",
                        "Category, version, unfinished-first, hide-completed, and pinyin search all stack.",
                        "カテゴリ・バージョン・未達成優先・達成済み非表示・ピンイン検索は併用できます。",
                        "분류, 버전, 미완료 우선, 완료 숨기기, 병음 검색을 함께 쓸 수 있습니다.",
                        "Catégorie, version, inachevés d'abord, masquer terminés et recherche pinyin se cumulent."
                    ),
                },
            ],
            callouts: [
                {
                    at: 2.0,
                    text: L("勾选即保存", "勾選即儲存", "Check to save", "チェックで保存", "체크 즉시 저장", "Cocher sauvegarde"),
                    x: 62,
                    y: 26,
                },
                {
                    at: 6.8,
                    text: L("拼音搜索", "拼音搜尋", "Pinyin search", "ピンイン検索", "병음 검색", "Recherche pinyin"),
                    x: 30,
                    y: 22,
                },
            ],
            note: L("本地清单", "本地清單", "Local list", "ローカルリスト", "로컬 목록", "Liste locale"),
        },
        {
            id: "achievement-caveat",
            chapter: L("成就边界", "成就邊界", "Achievement caveats", "実績の注意点", "업적 주의점", "Limites des succès"),
            duration: 9,
            shot: {
                type: "callout",
                kicker: "LOCAL ONLY",
                title: L(
                    "本地清单的三个坑",
                    "本地清單的三個坑",
                    "Three traps in the local list",
                    "ローカルリストの3つの落とし穴",
                    "로컬 목록의 세 가지 함정",
                    "Trois pièges de la liste locale"
                ),
                icon: "ri:error-warning-line",
                points: [
                    {
                        icon: "ri:refresh-line",
                        text: L(
                            "没有账号同步，换设备只能导入 JSON",
                            "沒有帳號同步，換裝置只能匯入 JSON",
                            "No account sync; moving devices means importing JSON",
                            "アカウント同期はなく、端末移行はJSONの読み込みのみ",
                            "계정 동기화가 없어 기기를 바꾸려면 JSON을 가져와야 합니다",
                            "Pas de synchro de compte ; changer d'appareil impose un import JSON"
                        ),
                    },
                    {
                        icon: "ri:list-check-2",
                        text: L(
                            "「全选本页」实际选中当前筛选的全部结果",
                            "「全選本頁」實際選中目前篩選的全部結果",
                            "“Select page” actually selects every filtered result",
                            "「ページ全選択」は絞り込み後の全件を選びます",
                            "'페이지 전체 선택'은 필터된 모든 결과를 선택합니다",
                            "« Tout sélectionner » coche en fait tous les résultats filtrés"
                        ),
                    },
                    {
                        icon: "ri:delete-bin-line",
                        text: L(
                            "清空不可恢复；导入会整体覆盖",
                            "清空不可恢復；匯入會整體覆蓋",
                            "Clearing is irreversible; importing overwrites everything",
                            "クリアは復元不可。読み込みは全体を上書きします",
                            "초기화는 되돌릴 수 없고, 가져오기는 전체를 덮어씁니다",
                            "Effacer est irréversible ; l'import écrase tout"
                        ),
                    },
                ],
                note: L(
                    "先导出备份",
                    "先匯出備份",
                    "Export a backup first",
                    "先にバックアップを書き出してください",
                    "먼저 백업을 내보내세요",
                    "Exportez d'abord une sauvegarde"
                ),
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "成就不读游戏账号，完成状态只存在本机浏览器。",
                        "成就不讀遊戲帳號，完成狀態只存在本機瀏覽器。",
                        "Achievements do not read your game account; completion lives only in this browser.",
                        "実績はゲームアカウントを読まず、達成状態はこのブラウザのみに保存されます。",
                        "업적은 게임 계정을 읽지 않으며, 완료 상태는 이 브라우저에만 저장됩니다.",
                        "Les succès ne lisent pas le compte du jeu ; l'état reste dans ce navigateur."
                    ),
                },
                {
                    at: 5.2,
                    text: L(
                        "「全选本页」会选中筛选后的全部结果，点之前先看数量。",
                        "「全選本頁」會選中篩選後的全部結果，點之前先看數量。",
                        "“Select page” selects every filtered result, so check the count first.",
                        "「ページ全選択」は絞り込み後の全件を選ぶので、先に件数を確認してください。",
                        "'페이지 전체 선택'은 필터된 모든 결과를 선택하므로 먼저 수량을 확인하세요.",
                        "« Tout sélectionner » coche tous les résultats filtrés ; vérifiez le nombre avant."
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
                    "先拥有，再完成",
                    "先擁有，再完成",
                    "Own first, then complete",
                    "まず所有し、次に達成",
                    "먼저 보유하고, 그다음 완료",
                    "Posséder d'abord, accomplir ensuite"
                ),
                checklist: [
                    L(
                        "同步只读已装备；之后要手动开筛选",
                        "同步只讀已裝備；之後要手動開篩選",
                        "Sync reads equipped gear only; open filters yourself afterward",
                        "同期は装着品のみ。その後フィルターを手動で開きます",
                        "동기화는 장착 장비만 읽으며, 이후 필터를 직접 열어야 합니다",
                        "La synchro ne lit que l'équipement porté ; ouvrez les filtres ensuite"
                    ),
                    L(
                        "库存是构筑候选池；JSON 只含武器",
                        "庫存是構築候選池；JSON 只含武器",
                        "Inventory is the build candidate pool; JSON covers weapons only",
                        "在庫は構築の候補プール。JSONは武器のみ",
                        "재고는 빌드 후보 풀이며, JSON은 무기만 포함합니다",
                        "L'inventaire est le vivier du build ; le JSON ne couvre que les armes"
                    ),
                    L(
                        "成就本地打勾；全选本页=全部筛选结果",
                        "成就本地打勾；全選本頁=全部篩選結果",
                        "Check achievements locally; “select page” means all filtered results",
                        "実績はローカルでチェック。「ページ全選択」は絞り込み全件",
                        "업적은 로컬에서 체크하며, '페이지 전체 선택'은 필터된 전체 결과입니다",
                        "Cochez les succès en local ; « tout sélectionner » vise tous les résultats filtrés"
                    ),
                ],
                route: "/inventory",
                routeLabel: L("打开库存管理", "開啟庫存管理", "Open Inventory", "在庫管理を開く", "재고 관리 열기", "Ouvrir l'inventaire"),
                hint: L(
                    "下一步：把画轴也排起来",
                    "下一步：把畫軸也排起來",
                    "Next: lay out your timeline too",
                    "次へ：タイムラインも組んでみましょう",
                    "다음: 타임라인도 그려 보세요",
                    "Ensuite : composez aussi votre chronologie"
                ),
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "现在，把你的库存和清单都整理好。",
                        "現在，把你的庫存和清單都整理好。",
                        "Now get your inventory and checklist in order.",
                        "さあ、在庫とリストを整えましょう。",
                        "이제 재고와 목록을 정리하세요.",
                        "Maintenant, mettez votre inventaire et votre liste en ordre."
                    ),
                },
            ],
        },
    ],
}
