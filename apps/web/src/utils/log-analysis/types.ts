import type { LogEvent } from "@/api/logAnalysis"

/** 怪物类别：0 普通 · 1 精英 · 2 BOSS · 3 召唤物 */
export type MobKind = 0 | 1 | 2 | 3

/** 分析引擎接受的日志事件（API 联合已包含 `aiCreate`）。 */
export type AnalysisLogEvent = LogEvent

/** 单次怪物死亡（已按 objId + Eid 合并多行死亡日志）。t 为 Unix 秒。 */
export interface KillEntry {
    t: number
    bp: string
    objId: number | null
    eid: number | null
    unitId: number | null
    name: string
    kind: MobKind
    reason: string | null
    x: number | null
    y: number | null
    z: number | null
}

export interface CompositionRow {
    name: string
    kind: MobKind
    count: number
    /** 占本局击杀的百分比（0–100） */
    pct: number
}

export interface BurstSegment {
    /** 相对本局首个击杀的秒数 */
    start: number
    end: number
    count: number
    /** 段内 3 秒滑窗峰值 */
    peak: number
}

/** 以秒为单位的相对时间序列；t 的基准由所属字段约定。 */
export interface SeriesPoint {
    t: number
    v: number
}

export interface DamageRow {
    name: string
    damage: number
    score: number
    /** 占总伤害的百分比（0–100） */
    pct: number
    /** 本行伤害 ÷ 战斗时长 */
    dps: number
    mvp: boolean
}

export interface SkillRow {
    skillId: number
    /** 游戏数据表没有名字时为 null，前端显示原始 ID */
    name: string | null
    count: number
}

export interface SkillGroup {
    eid: number
    name: string
    /** 本局该 Eid 对应的槽位名（主控为 "main"） */
    slots: string[]
    skills: SkillRow[]
}

/** 进本时请求的战斗资源；同一 UnitId 重复请求取单次最大数量，不累加。 */
export interface PreloadRow {
    unitId: number
    name: string | null
    count: number
}

/** 刷怪配额对齐记录：NeedBefore 是本轮补充前的缺口，QuotaLeft 是剩余配额。 */
export interface QuotaRow {
    unitSpawnId: number
    needBefore: number
    quotaLeft: number
    totalNeed: number
}

/** 本局战利品（游戏主动推送的 reward，按物品合并数量）。 */
export interface LootRow {
    id: number
    name: string
    rarity: number
    count: number
}

/** 事件流时间线；t 为绝对 Unix 秒，kind 为机器可读标签，title/detail 为可读文本。 */
export interface EventRow {
    t: number
    kind: string
    icon?: string
    title: string
    detail?: string
}

export type PartyRole = "main" | "phantom"

export interface PartySlot {
    slot: string
    name: string | null
    en: string | null
    bp: string | null
    eid: number | null
    /** 角色 ID（名字键后缀 / 技能前缀反查） */
    charId?: number | null
    /** 本局该角色技能施放次数 */
    casts?: number
    role?: PartyRole
}

export interface SessionInfo {
    dungeonId: number | null
    dungeonName: string | null
    mapId: string | null
    mapName: string | null
    mode: string | null
    level: number | null
    floor: { floorId: number; floor: number; monsterLevel: number; recLevel: number; season: number } | null
    hardBoss: { bossId: number; diff: number; level: number; name: string | null; region: string | null } | null
    gameName: string | null
}

/** 击杀点空间集中度：12×12 网格中前 12% 网格覆盖的击杀占比。 */
export interface ConcentrationInfo {
    /** 有击杀的网格数 */
    cells: number
    /** 网格边长（12） */
    grid: number
    /** 单格最高击杀占比 */
    peak: number
    /** 前 12% 网格的击杀占比 */
    share: number
    /** 落在取景框内的击杀点数 */
    inside: number
    /** 12×12 网格计数，行优先；仅调试/热力渲染用 */
    gridValues: number[]
}

export interface SeriesPoint2 {
    t: number
    x: number
    y: number
    /** 绝对时刻（Unix 秒），供事件流对齐；t 以首个命中点为基准 */
    absT?: number
}

/** BOSS 击杀对应的出生记录（Eid→UnitId 关联；旧日志可能只有 UnitId 没有坐标）。 */
export interface BossSpawnPoint {
    t: number
    x: number | null
    y: number | null
    z: number | null
    unitId: number | null
}

export interface AnalysisSession {
    /** 会话下标，0 起 */
    index: number
    /** 显示标签，如 `Lv.65 · 副本 40604` 或 `第 3 局` */
    label: string
    /** 首个击杀时刻（绝对 Unix 秒） */
    start: number
    /** 进本 / 进战锚点（绝对 Unix 秒） */
    enterT: number
    /** 最后一个死亡事件（含召唤物，绝对 Unix 秒） */
    end: number
    /** 结算时刻（绝对 Unix 秒） */
    settleT: number | null
    /** 进本（进战）到最后一个击杀的日志时长 */
    wallDur: number
    /** 首个怪物出现/首次命中到最后一个击杀的战斗时长 */
    combatDur: number
    win: boolean | null
    playerTime: number | null
    info: SessionInfo
    kills: KillEntry[]
    bossKills: KillEntry[]
    /** 与 bossKills 等长：每个 BOSS 击杀对应的 Eid→UnitId 出生记录 */
    bossSpawns: Array<BossSpawnPoint | null>
    summons: KillEntry[]
    /** 击杀速率：每分钟击杀数 */
    rate: number
    bursts: BurstSegment[]
    peak3s: number
    lifetime: { med: number; avg: number; p90: number } | null
    composition: CompositionRow[]
    /** 累计击杀曲线，t 相对首个击杀，v 为累计数 */
    cumKills: SeriesPoint[]
    /** 累计供给曲线（SpawnNextTeam / 怪物预加载），t 相对首个击杀 */
    cumSpawns: SeriesPoint[]
    /** 场上积压 = 累计供给 - 累计击杀；没有供给记录时为空数组 */
    gapSeries: SeriesPoint[]
    gapMax: { t: number; gap: number }
    aliveSeries: Array<{ t: number; alive: number; total: number }>
    /** 击杀节奏分桶宽度（秒） */
    rhythmBucket: number
    /** 击杀节奏：t 为分桶起点（相对首个击杀），v 为桶内击杀数 */
    rhythm: SeriesPoint[]
    space: {
        kills: Array<{ t: number; x: number; y: number; boss: boolean }>
        /** 命中落点，t 相对本局首个命中点 */
        hits: SeriesPoint2[]
        /** 怪物创建点（CreateUnitSuccess），t 相对本局首个击杀 */
        spawns: SeriesPoint2[]
        bounds: { minX: number; maxX: number; minY: number; maxY: number } | null
    }
    concentration: ConcentrationInfo | null
    board: DamageRow[]
    mvpScore: number | null
    mvpFactor: number | null
    totalDamage: number
    deathsByReason: Array<{ reason: string; count: number }>
    skills: SkillGroup[]
    /** 进本时请求的预加载资源（按 UnitId 汇总，数量取单次最大值） */
    preloads: PreloadRow[]
    /** 本局时窗内的刷怪配额对齐记录 */
    quotas: QuotaRow[]
    /** 本局战利品，按物品合并数量 */
    loot: LootRow[]
    events: EventRow[]
    party: PartySlot[]
    rift: { rooms: number; mobPhase: number; gapToBoss: number | null; bossName: string | null; finalBossDead: boolean } | null
    rewardRate: { bonus: number; exp: number } | null
}
