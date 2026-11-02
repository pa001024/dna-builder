import { L, type TimelineSlot, type Tutorial } from "../types"

const saiqi = L("赛琪", "賽琪", "Saiqi", "サイキ", "사이치", "Saiqi")
const lise = L("黎瑟", "黎瑟", "Lise", "リーゼ", "리제", "Lise")
const berenica = L("贝蕾妮卡", "貝蕾妮卡", "Berenica", "ベレニカ", "베레니카", "Berenica")
const daphne = L("达芙涅", "達芙涅", "Daphne", "ダフネ", "다프네", "Daphné")
const siren = L("塞壬的拥吻", "塞壬的擁吻", "Siren's Kiss", "セイレーンの口づけ", "세이렌의 입맞춤", "Baiser de Sirène")
const skillTrack = L("技能轨", "技能軌", "Skill", "スキル", "스킬", "Compétence")
const buffTrack = L("BUFF 轨", "BUFF 軌", "BUFF", "BUFF", "BUFF", "BUFF")
const skillE = L("E · 技能", "E · 技能", "E · Skill", "E · スキル", "E · 스킬", "E · Compétence")
const skillQ = L("Q · 技能", "Q · 技能", "Q · Skill", "Q · スキル", "Q · 스킬", "Q · Compétence")
const summon = L("召唤物", "召喚物", "Summon", "召喚物", "소환물", "Invocation")
const customBuff = L("自定义 BUFF", "自訂 BUFF", "Custom buff", "カスタムBUFF", "사용자 BUFF", "Buff personnalisé")
const atkBuff = L("攻击提升", "攻擊提升", "ATK up", "攻撃上昇", "공격 증가", "ATQ en hausse")

function createSlots(): TimelineSlot[] {
    return [
        {
            character: saiqi,
            weapon: siren,
            tracks: [
                {
                    label: skillTrack,
                    kind: "skill",
                    blocks: [
                        { start: 0.5, dur: 1.2, label: skillE, kind: "skill" },
                        { start: 5.8, dur: 2.4, label: skillQ, kind: "skill" },
                        { start: 12.0, dur: 1.6, label: summon, kind: "skill" },
                    ],
                },
                {
                    label: buffTrack,
                    kind: "buff",
                    blocks: [
                        { start: 1.0, dur: 4.0, label: customBuff, kind: "buff" },
                        { start: 8.0, dur: 3.0, label: atkBuff, kind: "buff" },
                    ],
                },
            ],
        },
        {
            character: lise,
            tracks: [
                { label: skillTrack, kind: "skill", blocks: [{ start: 3.2, dur: 1.4, label: skillE, kind: "skill" }] },
                { label: buffTrack, kind: "buff", blocks: [{ start: 6.0, dur: 2.5, label: customBuff, kind: "buff" }] },
            ],
        },
        {
            character: berenica,
            tracks: [
                { label: skillTrack, kind: "skill", blocks: [] },
                { label: buffTrack, kind: "buff", blocks: [] },
            ],
        },
        {
            character: daphne,
            tracks: [
                { label: skillTrack, kind: "skill", blocks: [] },
                { label: buffTrack, kind: "buff", blocks: [] },
            ],
        },
    ]
}

export const timelineTutorial: Tutorial = {
    id: "timeline",
    number: "05",
    category: "plan",
    title: L("时间线", "時間線", "Timeline", "タイムライン", "타임라인", "Chronologie"),
    subtitle: L(
        "把战斗顺序画成一条轴",
        "把戰鬥順序畫成一條軸",
        "Draw the fight order on one axis",
        "戦闘順を一本の軸に描く",
        "전투 순서를 하나의 축에 그리기",
        "Dessinez l'ordre du combat sur un axe"
    ),
    summary: L(
        "四个角色槽、多条技能与 BUFF 轨；拖动、缩放、保存方案与导出 JSON。",
        "四個角色槽、多條技能與 BUFF 軌；拖動、縮放、儲存方案與匯出 JSON。",
        "Four character slots with multiple skill and buff tracks; drag, zoom, save schemes, and export JSON.",
        "4つのキャラ枠に複数のスキル・BUFFトラック。ドラッグ、ズーム、プラン保存、JSON出力まで。",
        "네 캐릭터 슬롯과 여러 스킬·BUFF 트랙. 드래그, 확대/축소, 계획 저장, JSON 내보내기까지.",
        "Quatre emplacements de personnage et plusieurs pistes de compétence et de buff ; glisser, zoomer, sauvegarder et exporter en JSON."
    ),
    icon: "ri:timeline-view",
    accent: "#34d399",
    route: "/timeline",
    routeLabel: L("打开时间线", "開啟時間線", "Open Timeline", "タイムラインを開く", "타임라인 열기", "Ouvrir la chronologie"),
    platforms: ["web"],
    scenes: [
        {
            id: "intro",
            chapter: L("开场", "開場", "Intro", "導入", "인트로", "Intro"),
            duration: 5,
            shot: {
                type: "title",
                variant: "intro",
                kicker: L("EP 05 · 规划", "EP 05 · 規劃", "EP 05 · PLAN", "EP 05 · 計画", "EP 05 · 계획", "EP 05 · PLAN"),
                title: L("时间线", "時間線", "Timeline", "タイムライン", "타임라인", "Chronologie"),
                subtitle: L(
                    "四个角色槽，把技能与 BUFF 排成一条轴。",
                    "四個角色槽，把技能與 BUFF 排成一條軸。",
                    "Four character slots; arrange skills and buffs on one axis.",
                    "4つのキャラ枠に、スキルとBUFFを一本の軸へ。",
                    "네 캐릭터 슬롯에 스킬과 버프를 하나의 축으로.",
                    "Quatre emplacements pour aligner compétences et buffs sur un axe."
                ),
                icon: "ri:timeline-view",
                index: "05",
            },
            captions: [
                {
                    at: 0.9,
                    text: L(
                        "这一集只做规划：把战斗顺序画在同一张时间轴上。",
                        "這一集只做規劃：把戰鬥順序畫在同一張時間軸上。",
                        "This episode is pure planning: draw the fight order on one timeline.",
                        "この回は計画だけ。戦闘順を1本のタイムラインに描きます。",
                        "이번 편은 계획만 다룹니다. 전투 순서를 하나의 타임라인에 그립니다.",
                        "Cet épisode ne fait que planifier : dessinez l'ordre du combat sur une chronologie."
                    ),
                },
            ],
        },
        {
            id: "drag",
            chapter: L("拖入技能", "拖入技能", "Drag in skills", "スキルを配置", "스킬 배치", "Placer des compétences"),
            duration: 11,
            shot: {
                type: "timeline",
                title: L(
                    "把技能拖上轨",
                    "把技能拖上軌",
                    "Drag skills onto tracks",
                    "スキルをトラックへ",
                    "스킬을 트랙으로",
                    "Glissez les compétences sur les pistes"
                ),
                slots: createSlots(),
                phase: "drag",
                dragLabel: skillE,
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "四个角色槽，每槽可以加多条技能轨和 BUFF 轨。",
                        "四個角色槽，每槽可以加多條技能軌和 BUFF 軌。",
                        "Four character slots, each with multiple skill and buff tracks.",
                        "キャラ枠は4つ。各枠にスキルとBUFFのトラックを複数追加できます。",
                        "캐릭터 슬롯은 네 개이며, 각 슬롯에 스킬과 버프 트랙을 여러 개 추가할 수 있습니다.",
                        "Quatre emplacements de personnage, chacun avec plusieurs pistes de compétence et de buff."
                    ),
                },
                {
                    at: 5.6,
                    text: L(
                        "从左侧库拖技能进来；只能落到同类型轨道。",
                        "從左側庫拖技能進來；只能落到同類型軌道。",
                        "Drag a skill from the left library; it can only land on a matching track.",
                        "左のライブラリからスキルをドラッグ。同じ種類のトラックにしか置けません。",
                        "왼쪽 라이브러리에서 스킬을 드래그하세요. 같은 유형 트랙에만 놓을 수 있습니다.",
                        "Glissez une compétence depuis la bibliothèque ; seule une piste du même type l'accepte."
                    ),
                },
            ],
            callouts: [
                {
                    at: 2.0,
                    text: L("拖拽技能", "拖曳技能", "Drag a skill", "スキルをドラッグ", "스킬 드래그", "Glissez une compétence"),
                    x: 28,
                    y: 30,
                },
                {
                    at: 6.6,
                    text: L("同类型轨道", "同類型軌道", "Matching track", "同じ種類のトラック", "같은 유형 트랙", "Piste du même type"),
                    x: 62,
                    y: 46,
                },
            ],
            cursor: {
                at: 1.2,
                path: [
                    [18, 40],
                    [28, 42],
                    [42, 48],
                    [52, 50],
                ],
                clickAt: 4.2,
            },
            note: L("本地编辑", "本地編輯", "Local editor", "ローカル編集", "로컬 편집", "Éditeur local"),
        },
        {
            id: "resize",
            chapter: L("调整时间块", "調整時間塊", "Adjust blocks", "ブロック調整", "블록 조정", "Ajuster les blocs"),
            duration: 10,
            shot: {
                type: "timeline",
                title: L(
                    "拖身改时间，拖边改时长",
                    "拖身改時間，拖邊改時長",
                    "Drag the body for start, edges for duration",
                    "本体で開始、端で長さ",
                    "몸체로 시작, 가장자리로 길이",
                    "Corps pour le début, bords pour la durée"
                ),
                slots: createSlots(),
                phase: "resize",
                dragLabel: skillQ,
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "拖块身改开始时间，拖左右边缘改时长。",
                        "拖塊身改開始時間，拖左右邊緣改時長。",
                        "Drag the block body to change its start; drag an edge to change duration.",
                        "ブロック本体で開始時間、左右の端で長さを変えます。",
                        "블록 몸체를 끌어 시작 시간을, 가장자리를 끌어 길이를 바꿉니다.",
                        "Glissez le corps pour le début, un bord pour la durée."
                    ),
                },
                {
                    at: 5.0,
                    text: L(
                        "Ctrl/⌘ 点击多选，Delete 删除；空白拖动框选。",
                        "Ctrl/⌘ 點擊多選，Delete 刪除；空白拖動框選。",
                        "Ctrl/⌘-click to multi-select, Delete to remove; drag empty space to marquee.",
                        "Ctrl/⌘クリックで複数選択、Deleteで削除。空白をドラッグで範囲選択。",
                        "Ctrl/⌘ 클릭으로 다중 선택, Delete로 삭제, 빈 공간 드래그로 범위 선택.",
                        "Ctrl/⌘-clic pour multi-sélectionner, Suppr pour effacer ; glissez le vide pour encadrer."
                    ),
                },
            ],
            callouts: [
                {
                    at: 2.2,
                    text: L("拖边缘", "拖邊緣", "Drag an edge", "端をドラッグ", "가장자리 드래그", "Glissez un bord"),
                    x: 46,
                    y: 54,
                },
                {
                    at: 6.4,
                    text: L(
                        "多选 / 删除",
                        "多選 / 刪除",
                        "Multi-select / delete",
                        "複数選択 / 削除",
                        "다중 선택 / 삭제",
                        "Multi-sélection / suppr."
                    ),
                    x: 68,
                    y: 40,
                },
            ],
            cursor: {
                at: 1.4,
                path: [
                    [50, 46],
                    [52, 48],
                    [53, 50],
                ],
                clickAt: 2.2,
            },
        },
        {
            id: "zoom-pan",
            chapter: L("平移与缩放", "平移與縮放", "Pan and zoom", "パンとズーム", "이동과 확대", "Panoramique et zoom"),
            duration: 8.5,
            shot: {
                type: "timeline",
                title: L(
                    "中键平移，Ctrl/⌘ 滚轮缩放",
                    "中鍵平移，Ctrl/⌘ 滾輪縮放",
                    "Middle-drag to pan, Ctrl/⌘ wheel to zoom",
                    "中ボタンでパン、Ctrl/⌘ホイールでズーム",
                    "중간 버튼 이동, Ctrl/⌘ 휠 확대",
                    "Molette Ctrl/⌘ pour zoomer, bouton central pour paner"
                ),
                slots: createSlots(),
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "中键拖动画布平移；Ctrl/⌘ + 滚轮以鼠标为锚缩放。",
                        "中鍵拖動畫布平移；Ctrl/⌘ + 滾輪以滑鼠為錨縮放。",
                        "Middle-drag to pan; Ctrl/⌘ + wheel zooms anchored at the mouse.",
                        "中ボタンドラッグでパン。Ctrl/⌘＋ホイールでマウス位置を基準にズーム。",
                        "중간 버튼 드래그로 이동하고, Ctrl/⌘ + 휠로 마우스 기준 확대합니다.",
                        "Glissez avec le bouton central pour paner ; Ctrl/⌘ + molette zoome autour du curseur."
                    ),
                },
                {
                    at: 4.8,
                    text: L(
                        "缩放以鼠标位置为锚，密集的时间块也能对齐。",
                        "縮放以滑鼠位置為錨，密集的時間塊也能對齊。",
                        "Zoom anchors at the mouse, so dense blocks stay easy to align.",
                        "マウス位置を基準にズームするので、密集したブロックも合わせやすい。",
                        "마우스 위치를 기준으로 확대되어 빽빽한 블록도 정렬하기 쉽습니다.",
                        "Le zoom s'ancre au curseur, ce qui facilite l'alignement des blocs denses."
                    ),
                },
            ],
            callouts: [
                {
                    at: 2.0,
                    text: L("中键平移", "中鍵平移", "Middle-drag pan", "中ボタンでパン", "중간 버튼 이동", "Pan au bouton central"),
                    x: 40,
                    y: 50,
                },
                { at: 5.8, text: L("鼠标锚点", "滑鼠錨點", "Mouse anchor", "マウス基準", "마우스 기준", "Ancrage souris"), x: 62, y: 38 },
            ],
            cursor: {
                at: 1.2,
                path: [
                    [50, 52],
                    [54, 50],
                    [58, 46],
                ],
                clickAt: 2.0,
            },
            note: L("视口操作", "視口操作", "Viewport", "ビュー操作", "뷰 조작", "Vue"),
        },
        {
            id: "buff",
            chapter: L("排 BUFF", "排 BUFF", "Place buffs", "BUFFを配置", "버프 배치", "Placer des buffs"),
            duration: 10.5,
            shot: {
                type: "timeline",
                title: L(
                    "BUFF 走 BUFF 轨",
                    "BUFF 走 BUFF 軌",
                    "Buffs stay on buff tracks",
                    "BUFFはBUFFトラックへ",
                    "버프는 버프 트랙으로",
                    "Les buffs restent sur les pistes de buff"
                ),
                slots: createSlots(),
                phase: "buff",
                dragLabel: customBuff,
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "切到 BUFF 库，先把等级调好，再拖进 BUFF 轨。",
                        "切到 BUFF 庫，先把等級調好，再拖進 BUFF 軌。",
                        "Switch to the buff library, set the level, then drag onto a buff track.",
                        "BUFFライブラリに切り替え、レベルを決めてBUFFトラックへドラッグ。",
                        "BUFF 라이브러리로 전환해 레벨을 정한 뒤 BUFF 트랙으로 드래그하세요.",
                        "Passez à la bibliothèque de buffs, réglez le niveau, puis glissez sur une piste de buff."
                    ),
                },
                {
                    at: 5.2,
                    text: L(
                        "技能和 BUFF 不能混放，时间块会吸附到网格。",
                        "技能和 BUFF 不能混放，時間塊會吸附到網格。",
                        "Skills and buffs cannot mix; blocks snap to the grid.",
                        "スキルとBUFFは混在できません。ブロックはグリッドに吸着します。",
                        "스킬과 버프는 섞을 수 없으며, 블록은 그리드에 스냅됩니다.",
                        "Compétences et buffs ne se mélangent pas ; les blocs s'alignent sur la grille."
                    ),
                },
            ],
            callouts: [
                {
                    at: 2.0,
                    text: L("BUFF 库", "BUFF 庫", "Buff library", "BUFFライブラリ", "BUFF 라이브러리", "Bibliothèque de buffs"),
                    x: 20,
                    y: 28,
                },
                { at: 6.4, text: L("吸附", "吸附", "Snap", "スナップ", "스냅", "Alignement"), x: 56, y: 52 },
            ],
            cursor: {
                at: 1.2,
                path: [
                    [16, 30],
                    [30, 34],
                    [44, 46],
                    [54, 50],
                ],
                clickAt: 3.8,
            },
        },
        {
            id: "hp",
            chapter: L("血量曲线", "血量曲線", "HP curve", "HPカーブ", "HP 곡선", "Courbe de PV"),
            duration: 10,
            shot: {
                type: "timeline",
                title: L("底部血量曲线", "底部血量曲線", "HP curve at the bottom", "下部のHPカーブ", "하단 HP 곡선", "Courbe de PV en bas"),
                slots: createSlots(),
                phase: "hp",
                hp: [100, 100, 92, 80, 64, 45, 30, 18, 8, 0],
                showHp: true,
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "底部血量曲线：点击空白加点，拖动改值，右键删除。",
                        "底部血量曲線：點擊空白加點，拖動改值，右鍵刪除。",
                        "HP curve at the bottom: click to add, drag to move, right-click to delete.",
                        "下部のHPカーブ：空白クリックで追加、ドラッグで移動、右クリックで削除。",
                        "하단 HP 곡선: 빈 곳 클릭으로 추가, 드래그로 이동, 우클릭으로 삭제.",
                        "Courbe de PV en bas : cliquez pour ajouter, glissez pour déplacer, clic droit pour supprimer."
                    ),
                },
                {
                    at: 5.0,
                    text: L(
                        "曲线与时间轴同步滚动，用来标记掉血节奏。",
                        "曲線與時間軸同步滾動，用來標記掉血節奏。",
                        "It scrolls with the timeline and marks the damage rhythm.",
                        "タイムラインと同期してスクロールし、被ダメージのリズムを記録します。",
                        "타임라인과 함께 스크롤되며 피해 리듬을 표시합니다.",
                        "Elle défile avec la chronologie et marque le rythme des dégâts."
                    ),
                },
            ],
            callouts: [
                {
                    at: 2.6,
                    text: L("点击加点", "點擊加點", "Click to add", "クリックで追加", "클릭으로 추가", "Cliquez pour ajouter"),
                    x: 40,
                    y: 84,
                },
                {
                    at: 6.2,
                    text: L(
                        "右键删除",
                        "右鍵刪除",
                        "Right-click to delete",
                        "右クリックで削除",
                        "우클릭으로 삭제",
                        "Clic droit pour supprimer"
                    ),
                    x: 70,
                    y: 84,
                },
            ],
            cursor: {
                at: 1.4,
                path: [
                    [34, 82],
                    [42, 81],
                    [50, 80],
                ],
                clickAt: 2.6,
            },
        },
        {
            id: "save",
            chapter: L("保存方案", "儲存方案", "Save schemes", "プラン保存", "계획 저장", "Enregistrer les plans"),
            duration: 9.5,
            shot: {
                type: "timeline",
                title: L(
                    "保存方案与 JSON",
                    "儲存方案與 JSON",
                    "Save schemes and JSON",
                    "プランとJSONを保存",
                    "계획과 JSON 저장",
                    "Enregistrer plans et JSON"
                ),
                slots: createSlots(),
                phase: "save",
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "文件夹里输入方案名保存；同名会直接覆盖。",
                        "資料夾裡輸入方案名儲存；同名會直接覆蓋。",
                        "Name a scheme in the folder menu; saving under the same name overwrites it.",
                        "フォルダーでプラン名を入力して保存。同名は上書きされます。",
                        "폴더에서 계획 이름을 입력해 저장하며, 같은 이름은 덮어씁니다.",
                        "Nommez un plan dans le dossier ; un nom identique l'écrase."
                    ),
                },
                {
                    at: 4.8,
                    text: L(
                        "可导出/导入 JSON；「新建方案」只清名字，画布还在。",
                        "可匯出/匯入 JSON；「新建方案」只清名字，畫布還在。",
                        "Export/import JSON; “New” clears only the name, not the canvas.",
                        "JSON入出力可。「新規」は名前だけを消し、キャンバスは残ります。",
                        "JSON 내보내기/가져오기 가능. '새 계획'은 이름만 지우고 캔버스는 유지됩니다.",
                        "Export/import JSON ; « Nouveau » ne vide que le nom, pas le canevas."
                    ),
                },
            ],
            callouts: [
                { at: 2.0, text: L("保存方案", "儲存方案", "Save scheme", "プラン保存", "계획 저장", "Enregistrer le plan"), x: 30, y: 20 },
                {
                    at: 6.0,
                    text: L("导出 JSON", "匯出 JSON", "Export JSON", "JSON出力", "JSON 내보내기", "Exporter en JSON"),
                    x: 62,
                    y: 26,
                },
            ],
            note: L("本地存储", "本地儲存", "Local storage", "ローカル保存", "로컬 저장", "Stockage local"),
        },
        {
            id: "not-simulation",
            chapter: L("边界", "邊界", "Boundaries", "境界", "경계", "Limites"),
            duration: 9,
            shot: {
                type: "callout",
                kicker: "NOT A SIMULATOR",
                title: L(
                    "它是规划，不是模拟",
                    "它是規劃，不是模擬",
                    "It plans, it does not simulate",
                    "計画であり、シミュレーションではありません",
                    "계획이며 시뮬레이션이 아닙니다",
                    "De la planification, pas une simulation"
                ),
                icon: "ri:information-line",
                points: [
                    {
                        icon: "ri:timeline-view",
                        text: L(
                            "没有播放模拟和伤害结算，只有时间块与属性预览",
                            "沒有播放模擬和傷害結算，只有時間塊與屬性預覽",
                            "No playback or damage resolution; only blocks and attribute previews",
                            "再生もダメージ計算もなく、ブロックと属性プレビューのみ",
                            "재생과 피해 계산 없이 블록과 속성 미리보기만 제공",
                            "Pas de lecture ni de calcul de dégâts ; seulement des blocs et des aperçus d'attributs"
                        ),
                    },
                    {
                        icon: "ri:share-line",
                        text: L(
                            "没有云端分享链接；分享靠导出 JSON",
                            "沒有雲端分享連結；分享靠匯出 JSON",
                            "No cloud share link; sharing means exporting JSON",
                            "クラウド共有リンクはなく、共有はJSON出力のみ",
                            "클라우드 공유 링크는 없으며, 공유는 JSON 내보내기뿐입니다",
                            "Pas de lien de partage cloud ; partager signifie exporter un JSON"
                        ),
                    },
                    {
                        icon: "ri:delete-bin-line",
                        text: L(
                            "没有撤销/重做，删除轨道和方案不可恢复",
                            "沒有復原/重做，刪除軌道和方案不可恢復",
                            "No undo/redo; deleting tracks or schemes is irreversible",
                            "元に戻す/やり直しはなく、トラックやプランの削除は復元できません",
                            "실행 취소/다시 실행이 없으며, 트랙과 계획 삭제는 되돌릴 수 없습니다",
                            "Pas d'annulation/rétablissement ; supprimer pistes ou plans est irréversible"
                        ),
                    },
                ],
                note: L(
                    "与构筑页旧时间线解耦",
                    "與構築頁舊時間線解耦",
                    "Decoupled from the old build-page timeline",
                    "構築ページの旧タイムラインとは分離",
                    "빌드 페이지의 기존 타임라인과 분리",
                    "Découplé de l'ancienne chronologie du build"
                ),
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "这个编辑器不播放、不结算伤害，只画时间块。",
                        "這個編輯器不播放、不結算傷害，只畫時間塊。",
                        "This editor does not play or resolve damage; it only lays out blocks.",
                        "このエディタは再生もダメージ計算もせず、ブロックを並べるだけです。",
                        "이 편집기는 재생하거나 피해를 계산하지 않고 블록만 배치합니다.",
                        "Cet éditeur ne lit rien et ne calcule pas les dégâts ; il place des blocs."
                    ),
                },
                {
                    at: 5.0,
                    text: L(
                        "分享只有 JSON；也没有撤销，删除前想清楚。",
                        "分享只有 JSON；也沒有復原，刪除前想清楚。",
                        "Sharing is JSON only, and there is no undo, so delete carefully.",
                        "共有はJSONのみ。元に戻せないので削除は慎重に。",
                        "공유는 JSON뿐이며 실행 취소가 없으니 삭제에 주의하세요.",
                        "Le partage se fait en JSON et il n'y a pas d'annulation ; supprimez prudemment."
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
                    "把循环画成一条轴",
                    "把循環畫成一條軸",
                    "Draw the rotation on one axis",
                    "ローテーションを一本の軸に",
                    "사이클을 하나의 축으로",
                    "Dessinez la rotation sur un axe"
                ),
                checklist: [
                    L(
                        "4 槽位 × 多轨；拖拽只认同类型",
                        "4 槽位 × 多軌；拖曳只認同類型",
                        "4 slots × multiple tracks; drags only match track type",
                        "4枠×複数トラック。ドラッグは同種のみ",
                        "4슬롯 × 다중 트랙, 같은 유형만 드래그 가능",
                        "4 emplacements × plusieurs pistes ; glisser ne va qu'au même type"
                    ),
                    L(
                        "拖身改开始，拖边改时长，Ctrl/⌘ 多选",
                        "拖身改開始，拖邊改時長，Ctrl/⌘ 多選",
                        "Drag body for start, edges for duration, Ctrl/⌘ to multi-select",
                        "本体で開始、端で長さ、Ctrl/⌘で複数選択",
                        "몸체로 시작, 가장자리로 길이, Ctrl/⌘로 다중 선택",
                        "Corps pour le début, bords pour la durée, Ctrl/⌘ pour multi-sélectionner"
                    ),
                    L(
                        "方案本地保存；无播放、无链接、无撤销",
                        "方案本地儲存；無播放、無連結、無復原",
                        "Schemes save locally; no playback, links, or undo",
                        "プランはローカル保存。再生・リンク・取り消しなし",
                        "계획은 로컬 저장, 재생/링크/실행 취소 없음",
                        "Plans en local ; pas de lecture, lien ni annulation"
                    ),
                ],
                route: "/timeline",
                routeLabel: L(
                    "去画一条时间轴",
                    "去畫一條時間軸",
                    "Draw a timeline",
                    "タイムラインを描く",
                    "타임라인 그리기",
                    "Dessiner une chronologie"
                ),
                hint: L(
                    "下一步：把轴上的伤害写进目标函数",
                    "下一步：把軸上的傷害寫進目標函數",
                    "Next: put the damage into the target function",
                    "次へ：軸上のダメージを目標関数へ",
                    "다음: 축의 피해를 목표 함수에 반영",
                    "Ensuite : intégrez les dégâts dans la fonction cible"
                ),
            },
            captions: [
                {
                    at: 0.8,
                    text: L(
                        "现在，去把下一场循环排清楚。",
                        "現在，去把下一場循環排清楚。",
                        "Now go lay out your next rotation.",
                        "さあ、次のローテーションを組み立てましょう。",
                        "이제 다음 사이클을 정리해 보세요.",
                        "Maintenant, composez votre prochaine rotation."
                    ),
                },
            ],
        },
    ],
}
