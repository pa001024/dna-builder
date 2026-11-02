import { appearanceTutorial } from "./tutorials/appearance"
import { buildAnalysisTutorial } from "./tutorials/build-analysis"
import { charBuildTutorial } from "./tutorials/char-build"
import { communityTutorial } from "./tutorials/community"
import { databaseMapTutorial } from "./tutorials/database-map"
import { desktopTutorial } from "./tutorials/desktop"
import { flowTutorial } from "./tutorials/flow"
import { inventoryAchievementTutorial } from "./tutorials/inventory-achievement"
import { modsTutorial } from "./tutorials/mods"
import { quickStartTutorial } from "./tutorials/quick-start"
import { skinColorizeTutorial } from "./tutorials/skin-colorize"
import { timelineTutorial } from "./tutorials/timeline"
import { L, type Tutorial, type TutorialCategory } from "./types"

export const HELP_CATEGORIES: TutorialCategory[] = [
    {
        id: "start",
        title: L("开始使用", "開始使用", "Getting started", "はじめに", "시작하기", "Premiers pas"),
        desc: L(
            "装好数据包，认路，第一次上手",
            "裝好資料包，認路，第一次上手",
            "Install the data pack, learn the map, get productive",
            "データを入れて、道順を覚えて、最初の一歩",
            "데이터 팩 설치부터 첫 사용까지",
            "Installer les données et démarrer"
        ),
        icon: "ri:rocket-2-line",
        accent: "#4facfe",
    },
    {
        id: "build",
        title: L("构筑与分析", "構築與分析", "Build & analysis", "構築と分析", "빌드와 분석", "Construction et analyse"),
        desc: L(
            "角色、武器、魔之楔与伤害优化",
            "角色、武器、魔之楔與傷害最佳化",
            "Characters, weapons, mods, and damage optimization",
            "キャラ・武器・魔之楔・ダメージ最適化",
            "캐릭터, 무기, 모드, 피해 최적화",
            "Personnages, armes, mods et optimisation"
        ),
        icon: "ri:hammer-line",
        accent: "#f5576c",
    },
    {
        id: "plan",
        title: L("规划与记录", "規劃與記錄", "Plan & record", "計画と記録", "계획과 기록", "Planifier et suivre"),
        desc: L(
            "仓库、成就、时间轴与养成计划",
            "倉庫、成就、時間軸與養成計畫",
            "Inventory, achievements, timeline, and level-up planning",
            "在庫・実績・タイムライン・育成計画",
            "인벤토리, 업적, 타임라인, 육성 계획",
            "Inventaire, succès, chronologie et progression"
        ),
        icon: "ri:calendar-check-line",
        accent: "#43e97b",
    },
    {
        id: "data",
        title: L("资料与工具", "資料與工具", "Data & tools", "データとツール", "데이터와 도구", "Données et outils"),
        desc: L(
            "资料库、地图、节点编辑器与染色",
            "資料庫、地圖、節點編輯器與染色",
            "Database, maps, node editor, and dyeing",
            "データベース・地図・ノード編集・染色",
            "데이터베이스, 지도, 노드 편집기, 염색",
            "Base de données, cartes, nœuds et teinture"
        ),
        icon: "ri:database-2-line",
        accent: "#00c6ff",
    },
    {
        id: "desktop",
        title: L("桌面端", "桌面端", "Desktop", "デスクトップ", "데스크톱", "Bureau"),
        desc: L(
            "启动器、MOD、狩月账本与浮窗",
            "啟動器、MOD、狩月帳本與浮窗",
            "Launcher, mods, AFK ledger, and overlays",
            "ランチャー・MOD・狩月帳・小窓",
            "런처, 모드, 수월 장부, 오버레이",
            "Lanceur, mods, registre AFK et overlays"
        ),
        icon: "ri:windows-fill",
        accent: "#7f00ff",
    },
    {
        id: "community",
        title: L("社区与设置", "社群與設定", "Community & settings", "コミュニティと設定", "커뮤니티와 설정", "Communauté et réglages"),
        desc: L(
            "账号、聊天、攻略、外观与数据包",
            "帳號、聊天、攻略、外觀與資料包",
            "Accounts, chat, guides, appearance, and data packs",
            "アカウント・チャット・攻略・外観・データ",
            "계정, 채팅, 공략, 외형, 데이터 팩",
            "Comptes, chat, guides, apparence et données"
        ),
        icon: "ri:chat-3-line",
        accent: "#f7971e",
    },
]

export const HELP_TUTORIALS: Tutorial[] = [
    quickStartTutorial,
    charBuildTutorial,
    buildAnalysisTutorial,
    inventoryAchievementTutorial,
    timelineTutorial,
    databaseMapTutorial,
    flowTutorial,
    skinColorizeTutorial,
    desktopTutorial,
    modsTutorial,
    communityTutorial,
    appearanceTutorial,
].sort((a, b) => a.number.localeCompare(b.number))
