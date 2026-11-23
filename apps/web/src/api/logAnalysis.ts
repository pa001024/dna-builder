import { invoke } from "@tauri-apps/api/core"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"

/** 日志分析启动结果（Rust `LogAnalysisStartInfo`）。 */
export interface LogAnalysisStartInfo {
    path: string
    fileSize: number
    fromStart: boolean
    startedAt: number
}

/** 日志分析会话状态（Rust `LogAnalysisStatus`）。 */
export interface LogAnalysisStatus {
    running: boolean
    path: string | null
    bytesRead: number
    linesRead: number
    fileSize: number
    startedAt: number | null
    error: string | null
}

export type LogAnalysisLifecycleState = "started" | "stopped" | "reset" | "error"

/** 监听生命周期事件：reset 表示文件被截断/轮转，前端需清空当前分析状态。 */
export interface LogAnalysisLifecycleEvent {
    state: LogAnalysisLifecycleState
    path?: string
    reason?: string
    message?: string
}

/** 所有结构化日志事件的公共字段：Unix epoch 秒（毫秒精度）。 */
interface LogEventBase {
    t: number
}

export interface LogCmdEvent extends LogEventBase {
    k: "cmd"
    line: string
}

export interface LogDiagEvent extends LogEventBase {
    k: "diag"
    enable: boolean
    force: boolean
    effective: boolean
}

export interface LogDunEnterEvent extends LogEventBase {
    k: "dunEnter"
    dungeonId: number
}

export interface LogDunInitEvent extends LogEventBase {
    k: "dunInit"
    mode: string
}

export interface LogSoloFloorEvent extends LogEventBase {
    k: "soloFloor"
    floorId: number
    level: number
}

export interface LogSoloInitEvent extends LogEventBase {
    k: "soloInit"
    dungeonId: number
}

export interface LogLevelEvent extends LogEventBase {
    k: "level"
    levelId: string
    package: string
}

export interface LogMapEvent extends LogEventBase {
    k: "map"
    name: string
}

export interface LogTaskbarEvent extends LogEventBase {
    k: "taskbar"
    id: number
    status: string
    name: string
}

export interface LogHbEnterEvent extends LogEventBase {
    k: "hbEnter"
    bossId: number
    diff: number
}

export interface LogRegionEvent extends LogEventBase {
    k: "region"
    regionId: number
}

export interface LogVoteEvent extends LogEventBase {
    k: "vote"
    battleNum: number
}

export interface LogPreloadEvent extends LogEventBase {
    k: "preload"
    unitId: number
    count: number
}

export interface LogUnitCreateEvent extends LogEventBase {
    k: "unitCreate"
    eid: number
    unitId: number
    unitType: string
    x: number
    y: number
    z: number
}

/** CreateAIUnit 的怪物创建行：BOSS/召唤物 Eid→UnitId 最可靠来源。 */
export interface LogAiCreateEvent extends LogEventBase {
    k: "aiCreate"
    unitId: number
    eid: number
}

/** 进本引导事件：本版本没有 EnterDungeon callback 时的锚点兜底。 */
export interface LogEnterGuideEvent extends LogEventBase {
    k: "enterGuide"
    dungeonId: number
}

export interface LogSpawnEvent extends LogEventBase {
    k: "spawn"
    bp: string
    objId: number
    modelId: number
}

export interface LogDeathEvent extends LogEventBase {
    k: "death"
    bp: string
    objId: number
    eid: number
    createType: string
    creatorId: number
}

export interface LogDeathLocEvent extends LogEventBase {
    k: "deathLoc"
    x: number
    y: number
    z: number
}

export interface LogRealDeadEvent extends LogEventBase {
    k: "realDead"
    bp: string
    objId: number
    /** 行尾的死亡类型数字，仅记录不使用 */
    deadType?: number | null
}

export interface LogDeadDetailEvent extends LogEventBase {
    k: "deadDetail"
    bp: string
    objId: number
    eid: number
    createType: string
    creatorId: number
}

export interface LogReasonEvent extends LogEventBase {
    k: "reason"
    bp: string
    objId: number
    reason: string
}

export interface LogAliveEvent extends LogEventBase {
    k: "alive"
    unitSpawnId: number
    totalNeed: number
    membersNum: number
    expectedSum: number
    aliveSum: number
}

export interface LogQuotaEvent extends LogEventBase {
    k: "quota"
    unitSpawnId: number
    needBefore: number
    quotaLeft: number
    totalNeed: number
}

export interface LogTeamEvent extends LogEventBase {
    k: "team"
    index: number
    unitSpawnId: number
    teamLocs: number
}

export interface LogMvpEvent extends LogEventBase {
    k: "mvp"
    index: number
    name: string
    damage: number
    score: number
}

export interface LogMvpMetaEvent extends LogEventBase {
    k: "mvpMeta"
    score: number
    index: number
    name: string
}

export interface LogFactorEvent extends LogEventBase {
    k: "factor"
    value: number
}

export interface LogSettleEvent extends LogEventBase {
    k: "settle"
    win: boolean
    playerTime?: number | null
    gameTime?: number | null
    dungeonId: number
}

export interface LogFinishEvent extends LogEventBase {
    k: "finish"
    dungeonId: number
    ok: boolean
    playerTime?: number | null
    gameTime?: number | null
    /** 兼容旧字段名 */
    a?: number | null
    b?: number | null
}

export interface LogRewardEvent extends LogEventBase {
    k: "reward"
    json: string
}

export interface LogRewardRateEvent extends LogEventBase {
    k: "rewardRate"
    kind: string
    value: number
}

export interface LogHitEvent extends LogEventBase {
    k: "hit"
    x: number
    y: number
    z: number
    pawn?: string | null
}

export interface LogEidInitEvent extends LogEventBase {
    k: "eidInit"
    bp: string
    eid: number
}

export interface LogSkillEvent extends LogEventBase {
    k: "skill"
    eid: number
    skillId: number
    localRole: number
    /** 当前只上报 Start RealUseSkill，保留字段以便未来扩展 */
    phase?: "start" | "finish"
    action?: "use" | "stop"
}

export interface LogPanelSkillEvent extends LogEventBase {
    k: "panelSkill"
    skillId: number
}

export interface LogSlotSetEvent extends LogEventBase {
    k: "slotSet"
    slot: string
    bp?: string | null
}

export interface LogSlotNameEvent extends LogEventBase {
    k: "slotName"
    key: string
}

export interface LogSlotEnEvent extends LogEventBase {
    k: "slotEn"
    code: string
}

export interface LogSlotTextEvent extends LogEventBase {
    k: "slotText"
    text: string
}

export interface LogRiftInitEvent extends LogEventBase {
    k: "riftInit"
}

export interface LogRiftTimerEvent extends LogEventBase {
    k: "riftTimer"
    totalTime: number
}

export interface LogRiftEnterRoomEvent extends LogEventBase {
    k: "riftEnterRoom"
    roomId: number
}

export interface LogRiftSpawnEvent extends LogEventBase {
    k: "riftSpawn"
    roomId: number
    spawnId: number
}

export interface LogRiftClearEvent extends LogEventBase {
    k: "riftClear"
    roomId: number
}

export interface LogRiftTotalEvent extends LogEventBase {
    k: "riftTotal"
}

export interface LogRiftBossPickEvent extends LogEventBase {
    k: "riftBossPick"
    unitId: number
}

export interface LogRiftBossActiveEvent extends LogEventBase {
    k: "riftBossActive"
    eid: number
    unitId: number
}

export interface LogRiftBossDeadEvent extends LogEventBase {
    k: "riftBossDead"
}

/** 结构化战斗日志事件（与 Rust 后端的 `k` 判别联合一一对应）。 */
export type LogEvent =
    | LogCmdEvent
    | LogDiagEvent
    | LogDunEnterEvent
    | LogDunInitEvent
    | LogSoloFloorEvent
    | LogSoloInitEvent
    | LogLevelEvent
    | LogMapEvent
    | LogTaskbarEvent
    | LogHbEnterEvent
    | LogRegionEvent
    | LogVoteEvent
    | LogPreloadEvent
    | LogUnitCreateEvent
    | LogAiCreateEvent
    | LogEnterGuideEvent
    | LogSpawnEvent
    | LogDeathEvent
    | LogDeathLocEvent
    | LogRealDeadEvent
    | LogDeadDetailEvent
    | LogReasonEvent
    | LogAliveEvent
    | LogQuotaEvent
    | LogTeamEvent
    | LogMvpEvent
    | LogMvpMetaEvent
    | LogFactorEvent
    | LogSettleEvent
    | LogFinishEvent
    | LogRewardEvent
    | LogRewardRateEvent
    | LogHitEvent
    | LogEidInitEvent
    | LogSkillEvent
    | LogPanelSkillEvent
    | LogSlotSetEvent
    | LogSlotNameEvent
    | LogSlotEnEvent
    | LogSlotTextEvent
    | LogRiftInitEvent
    | LogRiftTimerEvent
    | LogRiftEnterRoomEvent
    | LogRiftSpawnEvent
    | LogRiftClearEvent
    | LogRiftTotalEvent
    | LogRiftBossPickEvent
    | LogRiftBossActiveEvent
    | LogRiftBossDeadEvent

export type LogEventKind = LogEvent["k"]

/** 后端一次 flush 上报的事件分包。 */
export interface LogBatch {
    seq: number
    events: LogEvent[]
    bytesRead: number
    linesRead: number
    fileSize: number
    eof: boolean
}

const EVENT_BATCH = "log-analysis://batch"
const EVENT_STATUS = "log-analysis://status"
const EVENT_LIFECYCLE = "log-analysis://lifecycle"

/**
 * 开始监听日志文件。
 * @param path 日志文件绝对路径
 * @param fromStart true 从头解析，false 只解析新写入内容
 */
export function startLogAnalysis(path: string, fromStart: boolean) {
    return invoke<LogAnalysisStartInfo>("log_analysis_start", { path, fromStart })
}

/** 停止当前日志监听会话。 */
export function stopLogAnalysis() {
    return invoke<void>("log_analysis_stop")
}

/** 读取当前监听状态（页面刷新后恢复运行态）。 */
export function getLogAnalysisStatus() {
    return invoke<LogAnalysisStatus>("log_analysis_status")
}

export function onLogAnalysisBatch(cb: (batch: LogBatch) => void): Promise<UnlistenFn> {
    return listen<LogBatch>(EVENT_BATCH, event => cb(event.payload))
}

export function onLogAnalysisStatus(cb: (status: LogAnalysisStatus) => void): Promise<UnlistenFn> {
    return listen<LogAnalysisStatus>(EVENT_STATUS, event => cb(event.payload))
}

export function onLogAnalysisLifecycle(cb: (payload: LogAnalysisLifecycleEvent) => void): Promise<UnlistenFn> {
    return listen<LogAnalysisLifecycleEvent>(EVENT_LIFECYCLE, event => cb(event.payload))
}
