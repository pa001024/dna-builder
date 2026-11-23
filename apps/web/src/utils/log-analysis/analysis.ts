/**
 * 战斗日志分析引擎：消费 Rust 后端解析出的结构化事件，产出按结算切分的会话指标。
 * 指标口径移植自参考实现 `EmLog`（createParser / buildAnchors / buildSegments / dedupeKills / stats），
 * 纯函数、无 IO；相同事件序列总是得到相同结果。
 */
import charData from "@/data/d/char.data"
import dungeonData from "@/data/d/dungeon.data"
import { hardBossData } from "@/data/d/hardboss.data"
import monsterData, { type Monster } from "@/data/d/monster.data"
import { RaidFloor } from "@/data/d/raid.data"
import regionData from "@/data/d/region.data"
import { type SubRegion, subRegionData } from "@/data/d/subregion.data"
import { monsterRefs, skillNames } from "./log-refs.data"
import type {
    AnalysisLogEvent,
    AnalysisSession,
    BossSpawnPoint,
    BurstSegment,
    CompositionRow,
    ConcentrationInfo,
    DamageRow,
    EventRow,
    KillEntry,
    LootRow,
    MobKind,
    PartySlot,
    PreloadRow,
    QuotaRow,
    SeriesPoint,
    SessionInfo,
    SkillGroup,
    SkillRow,
} from "./types"

/* ---------- 中间结构 ---------- */

interface ParsedKill {
    t: number
    bp: string
    objId: number
    eid: number | null
    createType: string | null
    creatorId: number | null
    x: number | null
    y: number | null
    z: number | null
    reason: string | null
    source: string
}

interface UnitCreateRecord {
    t: number
    eid: number
    unitId: number
    unitType: string
    x: number
    y: number
    z: number
}

interface AiCreateRecord {
    t: number
    eid: number
    unitId: number
}

interface SpawnRecord {
    t: number
    bp: string
    objId: number
    modelId: number
}

interface AliveRecord {
    t: number
    unitSpawnId: number
    totalNeed: number
    membersNum: number
    expectedSum: number
    aliveSum: number
}

interface TeamRecord {
    t: number
    index: number
    unitSpawnId: number
    teamLocs: number
}

interface MvpRecord {
    t: number
    index: number
    name: string
    damage: number
    score: number
}

interface MvpMetaRecord {
    t: number
    score: number
    index: number
    name: string
}

interface FactorRecord {
    t: number
    value: number
}

interface SettleRecord {
    t: number
    dungeonId: number
    win: boolean
    playerTime: number | null
    elapsed: number | null
}

interface EnterRecord {
    t: number
    dungeonId: number | null
    mode: string | null
}

interface SoloRaidRecord {
    t: number
    floorId: number | null
    level: number | null
    dungeonId: number | null
}

interface LevelRecord {
    t: number
    id: string
    pkg: string
}

interface MapRecord {
    t: number
    id: string
}

interface HardBossRecord {
    t: number
    boss: number
    diff: number
}

interface RegionRecord {
    t: number
    id: number
}

interface TaskbarRecord {
    t: number
    id: number
    status: string
    name: string
}

interface LootRecord {
    t: number
    id: number
    name: string
    rarity: number
    count: number
}

interface RewardRateRecord {
    t: number
    kind: "bonus" | "exp"
    value: number
}

interface PreloadRecord {
    t: number
    unitId: number
    count: number
}

interface QuotaRecord {
    t: number
    unitSpawnId: number
    needBefore: number
    quotaLeft: number
    totalNeed: number
}

interface HitRecord {
    t: number
    x: number
    y: number
    z: number
    pawn: string | null
}

type RiftRecord =
    | { t: number; type: "init" }
    | { t: number; type: "timer"; total: number }
    | { t: number; type: "enter"; room: number }
    | { t: number; type: "spawn"; room: number; spawnId: number }
    | { t: number; type: "clear"; room: number }
    | { t: number; type: "total" }
    | { t: number; type: "bossPick"; unitId: number }
    | { t: number; type: "bossActive"; eid: number; unitId: number }
    | { t: number; type: "bossDead" }

interface SkillEventRecord {
    t: number
    eid: number
    pre: string
    sid: string
}

interface SlotActor {
    bp: string | null
    line: string
}

interface SlotRecord {
    t: number
    actor: SlotActor | null
    key: string
    en: string | null
    text: string | null
}

interface MainActorRecord {
    t: number
    bp: string
    raw: string
}

interface PanelCharRecord {
    t: number
    skillId: number
    charId: number
}

interface LogData {
    kills: ParsedKill[]
    spawns: SpawnRecord[]
    unitCreates: UnitCreateRecord[]
    aiCreates: AiCreateRecord[]
    alive: AliveRecord[]
    teams: TeamRecord[]
    mvp: MvpRecord[]
    mvpMetas: MvpMetaRecord[]
    factors: FactorRecord[]
    settles: SettleRecord[]
    enters: EnterRecord[]
    soloRaids: SoloRaidRecord[]
    levels: LevelRecord[]
    dungeonMaps: MapRecord[]
    dungeonNames: Map<number, string>
    hardBosses: HardBossRecord[]
    regionMarks: RegionRecord[]
    taskbarEvents: TaskbarRecord[]
    loot: LootRecord[]
    rewardRates: RewardRateRecord[]
    preloads: PreloadRecord[]
    quotas: QuotaRecord[]
    hits: HitRecord[]
    rift: RiftRecord[]
    skillEvents: SkillEventRecord[]
    slots: SlotRecord[]
    mainActors: MainActorRecord[]
    mainChars: PanelCharRecord[]
    eidOfActor: Map<string, number>
    eidSkills: Map<number, Map<string, number>>
    reasons: Map<string, string>
}

interface ResolvedMob {
    name: string
    kind: MobKind
    unitId: number | null
}

interface Context {
    log: LogData
}

/* ---------- 解包数据索引（惰性构建一次） ---------- */

interface CharRef {
    id: number
    name: string
    code: string | null
}

interface DataIndexes {
    monsterById: Map<number, Monster>
    dungeonById: Map<number, { name: string; type: string; lv: number }>
    charById: Map<number, CharRef>
    iconIndex: Array<{ key: string; mob: Monster }>
    regionNameById: Map<number, string>
    subregionById: Map<number, SubRegion>
    regionPrefix: Map<string, string>
    hardBossLevel: Map<number, number>
    charSkillNames: Map<number, string>
}

let indexes: DataIndexes | null = null

function getIndexes(): DataIndexes {
    if (indexes) return indexes
    const monsterById = new Map<number, Monster>()
    const iconMap = new Map<string, Monster>()
    for (const mob of monsterData) {
        monsterById.set(mob.id, mob)
        if (mob.icon && mob.icon !== "Empty") {
            const key = normalizeMobKey(mob.icon)
            if (key && !iconMap.has(key)) iconMap.set(key, mob)
        }
    }
    const dungeonById = new Map<number, { name: string; type: string; lv: number }>()
    for (const d of dungeonData) dungeonById.set(d.id, { name: d.n, type: d.t, lv: d.lv })
    const charById = new Map<number, CharRef>()
    const charSkillNames = new Map<number, string>()
    for (const ch of charData) {
        charById.set(ch.id, { id: ch.id, name: ch.名称, code: ch.icon ?? null })
        collectSkillNames(ch.技能, charSkillNames)
        for (const w of ch.同律武器 ?? []) collectSkillNames(w.技能, charSkillNames)
    }
    const regionNameById = new Map<number, string>()
    for (const r of regionData) regionNameById.set(r.id, r.name)
    const subregionById = new Map<number, SubRegion>()
    for (const s of subRegionData) subregionById.set(s.id, s)
    const regionPrefix = new Map<string, string>()
    for (const sub of subRegionData) {
        const region = regionNameById.get(sub.rid)
        if (!region) continue
        const parts = sub.map.split("_")
        for (let n = parts.length; n > 0; n--) {
            const key = parts.slice(0, n).join("_")
            if (!regionPrefix.has(key)) regionPrefix.set(key, region)
        }
    }
    for (const r of regionData) {
        const key = (r.mapImage ?? "").replace(/^WBP_Map_Reg_/, "").replace(/^WBP_Map_/, "")
        if (key && !regionPrefix.has(key)) regionPrefix.set(key, r.name)
    }
    const hardBossLevel = new Map<number, number>()
    for (const boss of hardBossData) {
        for (const diff of boss.diff) if (!hardBossLevel.has(diff.id)) hardBossLevel.set(diff.id, diff.lv)
    }
    indexes = {
        monsterById,
        dungeonById,
        charById,
        iconIndex: [...iconMap.entries()].map(([key, mob]) => ({ key, mob })).sort((a, b) => b.key.length - a.key.length),
        regionNameById,
        subregionById,
        regionPrefix,
        hardBossLevel,
        charSkillNames,
    }
    return indexes
}

function collectSkillNames(skills: Array<{ id?: number; 名称?: string; 子技能?: unknown }> | undefined, out: Map<number, string>) {
    if (!skills) return
    for (const skill of skills) {
        if (skill.id != null && skill.名称 && !out.has(skill.id)) out.set(skill.id, skill.名称)
        if (Array.isArray(skill.子技能)) {
            collectSkillNames(skill.子技能 as Array<{ id?: number; 名称?: string; 子技能?: unknown }>, out)
        }
    }
}

/* ---------- 名称解析 ---------- */

/** 去掉蓝图/图标名里的对象池后缀与纯数字分段，用于图标前缀匹配。 */
function normalizeMobKey(value: string) {
    return value
        .toLowerCase()
        .replace(/_c\d+$/, "")
        .replace(/([a-z])(\d+)/g, "$1_$2")
        .split("_")
        .filter(part => part !== "" && !/^\d+$/.test(part))
        .join("_")
}

function kindOfMonster(mob: Monster): MobKind {
    if (mob.t === "Boss") return 2
    if (mob.t === "Elite_Monster" || mob.t === "Rescue_Elite_Monster") return 1
    return 0
}

function matchIconMob(bp: string): Monster | null {
    const key = normalizeMobKey(bp)
    if (!key) return null
    for (const entry of getIndexes().iconIndex) if (key.includes(entry.key)) return entry.mob
    return null
}

/**
 * 解析预加载 UnitId 的显示名：怪物表优先；角色单位 ID 的前四位是角色 ID。
 */
function unitLabel(unitId: number): string | null {
    const mob = getIndexes().monsterById.get(unitId)
    if (mob) return mob.n
    return getIndexes().charById.get(Math.floor(unitId / 100))?.name ?? null
}

/**
 * 解析怪物蓝图名。
 * 名称优先 UnitId（Eid→UnitId→monsterData），其次参考表 `m`、图标前缀、蓝图去前缀；
 * 类别以 BP 表 `m` 为准（G2：同一 UnitId 在状态表里可能是普通怪，但 BP 是 BOSS）。
 * @param unitId 可从 aiCreate / unitCreate 事件按 Eid 关联到的单位 ID
 */
export function resolveMonster(bp: string, unitId?: number | null): { name: string; kind: MobKind } {
    const raw = bp || ""
    let name: string | null = null
    let kind: MobKind | null = null
    const ref = monsterRefs[raw]
    if (unitId != null) {
        const mob = getIndexes().monsterById.get(unitId)
        if (mob) {
            name = mob.n
            kind = kindOfMonster(mob)
        }
    }
    if (ref) {
        if (name == null) name = ref[0]
        kind = ref[1]
    }
    if (name == null || kind == null) {
        const iconMob = matchIconMob(raw)
        if (iconMob) {
            if (name == null) name = iconMob.n
            if (kind == null) kind = kindOfMonster(iconMob)
        }
    }
    if (name == null) name = raw.replace(/^BP_/, "").replace(/_/g, " ") || raw
    if (kind == null) kind = /Boss/i.test(raw) ? 2 : 0
    if (kind === 0 && /Summon/i.test(raw)) kind = 3
    return { name, kind }
}

/* ---------- 事件 → 中间结构 ---------- */

const MERGE_WIN = 5

function sane(value: number) {
    return Number.isFinite(value) && Math.abs(value) <= 200000
}

function upsertKill(kills: ParsedKill[], data: ParsedKill): ParsedKill {
    const prev = findKill(kills, data.objId, data.t, data.eid)
    if (prev) {
        if (!prev.bp && data.bp) prev.bp = data.bp
        if (prev.eid == null && data.eid != null) prev.eid = data.eid
        if (prev.createType == null && data.createType != null) prev.createType = data.createType
        if (prev.creatorId == null && data.creatorId != null) prev.creatorId = data.creatorId
        if (prev.x == null && data.x != null) prev.x = data.x
        if (prev.y == null && data.y != null) prev.y = data.y
        if (prev.z == null && data.z != null) prev.z = data.z
        if (prev.reason == null && data.reason != null) prev.reason = data.reason
        return prev
    }
    kills.push(data)
    return data
}

function findKill(kills: ParsedKill[], objId: number, t: number, eid?: number | null): ParsedKill | null {
    for (let i = kills.length - 1; i >= 0; i--) {
        const k = kills[i]
        const dt = t - k.t
        if (dt > MERGE_WIN) break
        if (dt < -MERGE_WIN) continue
        if (k.objId !== objId) continue
        if (eid != null && k.eid != null && k.eid !== eid) continue
        return k
    }
    return null
}

function createEmptyLog(): LogData {
    return {
        kills: [],
        spawns: [],
        unitCreates: [],
        aiCreates: [],
        alive: [],
        teams: [],
        mvp: [],
        mvpMetas: [],
        factors: [],
        settles: [],
        enters: [],
        soloRaids: [],
        levels: [],
        dungeonMaps: [],
        dungeonNames: new Map(),
        hardBosses: [],
        regionMarks: [],
        taskbarEvents: [],
        loot: [],
        rewardRates: [],
        preloads: [],
        quotas: [],
        hits: [],
        rift: [],
        skillEvents: [],
        slots: [],
        mainActors: [],
        mainChars: [],
        eidOfActor: new Map(),
        eidSkills: new Map(),
        reasons: new Map(),
    }
}

function parseEvents(events: AnalysisLogEvent[]): LogData {
    const log = createEmptyLog()
    let offset = 0
    let lastT: number | null = null
    // P7：坐标行按死亡行自身时刻做 0–2s 关联，而不是按合并后击杀的 RealOnDead 时刻
    let pendingDeath: { kill: ParsedKill; tLine: number } | null = null
    let pendingActor: SlotActor | null = null
    let slotCur: SlotRecord | null = null

    // Rust 后端按日志顺序上报；原始时间戳倒退超过 60 秒视为游戏重启 / 日志追加。
    // 只按「原始时间戳」判断换纪元，并把新纪元整体平移到上一刻之后；
    // 不能拿平移后的时刻反复比较，否则偏移会随每条事件累加放大。
    let lastRaw: number | null = null
    const stamp = (raw: number) => {
        if (!Number.isFinite(raw)) return lastT ?? 0
        if (lastRaw !== null && raw < lastRaw - 60) offset = (lastT ?? raw) + 1 - raw
        lastRaw = raw
        const abs = raw + offset
        lastT = abs
        return abs
    }

    for (const ev of events) {
        const t = stamp(ev.t)
        switch (ev.k) {
            case "cmd":
            case "diag":
            case "vote":
                break
            case "dunEnter":
            case "enterGuide":
                log.enters.push({ t, dungeonId: ev.dungeonId, mode: null })
                break
            case "dunInit":
                log.enters.push({ t, dungeonId: null, mode: ev.mode })
                break
            case "soloFloor":
            case "soloInit": {
                const cur = log.soloRaids[log.soloRaids.length - 1]
                const target =
                    cur && Math.abs(cur.t - t) < 0.5
                        ? cur
                        : (() => {
                              const next: SoloRaidRecord = { t, floorId: null, level: null, dungeonId: null }
                              log.soloRaids.push(next)
                              return next
                          })()
                if (ev.k === "soloFloor") {
                    target.floorId = ev.floorId
                    target.level = ev.level
                } else {
                    target.dungeonId = ev.dungeonId
                }
                break
            }
            case "level": {
                const norm = ev.levelId.replace(/(_Art|BigObjs|SmallObjs)$/, "").replace(/_(\d+)(SmallObjs|BigObjs)?$/, "")
                if (norm && !/(_Art|BigObjs|SmallObjs)/.test(norm)) log.levels.push({ t, id: norm, pkg: ev.package })
                break
            }
            case "map":
                log.dungeonMaps.push({ t, id: ev.name.replace(/^.*\//, "") })
                break
            case "taskbar": {
                const name = ev.name.trim()
                log.dungeonNames.set(ev.id, name)
                log.taskbarEvents.push({ t, id: ev.id, status: ev.status, name })
                break
            }
            case "hbEnter":
                log.hardBosses.push({ t, boss: ev.bossId, diff: ev.diff })
                break
            case "region":
                log.regionMarks.push({ t, id: ev.regionId })
                break
            case "preload":
                log.preloads.push({ t, unitId: ev.unitId, count: ev.count })
                break
            case "quota":
                log.quotas.push({
                    t,
                    unitSpawnId: ev.unitSpawnId,
                    needBefore: ev.needBefore,
                    quotaLeft: ev.quotaLeft,
                    totalNeed: ev.totalNeed,
                })
                break
            case "unitCreate":
                log.unitCreates.push({
                    t,
                    eid: ev.eid,
                    unitId: ev.unitId,
                    unitType: ev.unitType,
                    x: ev.x,
                    y: ev.y,
                    z: ev.z,
                })
                break
            case "aiCreate":
                log.aiCreates.push({ t, eid: ev.eid, unitId: ev.unitId })
                break
            case "spawn":
                log.spawns.push({ t, bp: ev.bp, objId: ev.objId, modelId: ev.modelId })
                break
            case "death": {
                const k = upsertKill(log.kills, {
                    t,
                    bp: ev.bp,
                    objId: ev.objId,
                    eid: ev.eid,
                    createType: ev.createType || null,
                    creatorId: ev.creatorId,
                    x: null,
                    y: null,
                    z: null,
                    reason: null,
                    source: "deadAnim",
                })
                pendingDeath = { kill: k, tLine: t }
                break
            }
            case "deathLoc": {
                if (pendingDeath) {
                    const kill = pendingDeath.kill
                    if (t - pendingDeath.tLine <= 2 && kill.x === null && sane(ev.x) && sane(ev.y) && sane(ev.z)) {
                        kill.x = ev.x
                        kill.y = ev.y
                        kill.z = ev.z
                    }
                    pendingDeath = null
                }
                break
            }
            case "realDead": {
                upsertKill(log.kills, {
                    t,
                    bp: ev.bp,
                    objId: ev.objId,
                    eid: null,
                    createType: null,
                    creatorId: null,
                    x: null,
                    y: null,
                    z: null,
                    reason: null,
                    source: "realDead",
                })
                break
            }
            case "deadDetail": {
                let k = findKill(log.kills, ev.objId, t, ev.eid)
                if (!k) {
                    k = upsertKill(log.kills, {
                        t,
                        bp: ev.bp,
                        objId: ev.objId,
                        eid: ev.eid,
                        createType: ev.createType || null,
                        creatorId: ev.creatorId,
                        x: null,
                        y: null,
                        z: null,
                        reason: null,
                        source: "detail",
                    })
                } else {
                    k.bp = k.bp || ev.bp
                    k.eid = ev.eid
                    k.createType = ev.createType || null
                    k.creatorId = ev.creatorId
                }
                break
            }
            case "reason": {
                const k = findKill(log.kills, ev.objId, t)
                if (k) k.reason = ev.reason
                log.reasons.set(`${ev.objId}|${k && k.eid != null ? k.eid : ""}`, ev.reason)
                break
            }
            case "alive":
                log.alive.push({
                    t,
                    unitSpawnId: ev.unitSpawnId,
                    totalNeed: ev.totalNeed,
                    membersNum: ev.membersNum,
                    expectedSum: ev.expectedSum,
                    aliveSum: ev.aliveSum,
                })
                break
            case "team":
                log.teams.push({ t, index: ev.index, unitSpawnId: ev.unitSpawnId, teamLocs: ev.teamLocs })
                break
            case "mvp":
                log.mvp.push({ t, index: ev.index, name: ev.name.trim(), damage: ev.damage, score: ev.score })
                break
            case "mvpMeta":
                log.mvpMetas.push({ t, score: ev.score, index: ev.index, name: ev.name })
                break
            case "factor":
                log.factors.push({ t, value: ev.value })
                break
            case "settle":
                log.settles.push({
                    t,
                    dungeonId: ev.dungeonId,
                    win: ev.win,
                    playerTime: ev.playerTime ?? null,
                    elapsed: null,
                })
                break
            case "finish":
                // P4：第 3/4 个浮点分别是 PlayerTime / GameTime；a/b 为旧字段名兼容
                log.settles.push({
                    t,
                    dungeonId: ev.dungeonId,
                    win: ev.ok,
                    playerTime: ev.playerTime ?? ev.a ?? null,
                    elapsed: ev.gameTime ?? ev.b ?? null,
                })
                break
            case "reward": {
                try {
                    const data = JSON.parse(ev.json) as Record<string, unknown>
                    if (data && data.type === "reward") {
                        log.loot.push({
                            t,
                            id: Number(data.id) || 0,
                            name: typeof data.name === "string" && data.name ? data.name : "未知物品",
                            rarity: Number(data.rarity) || 0,
                            count: Number(data.count) || 1,
                        })
                    }
                } catch {
                    // 单行奖励 JSON 坏掉不影响整局
                }
                break
            }
            case "rewardRate":
                log.rewardRates.push({ t, kind: ev.kind === "Bonus" ? "bonus" : "exp", value: ev.value })
                break
            case "hit":
                log.hits.push({ t, x: ev.x, y: ev.y, z: ev.z, pawn: ev.pawn ?? null })
                break
            case "eidInit":
                log.eidOfActor.set(ev.bp, ev.eid)
                break
            case "skill": {
                const eid = ev.eid
                const pre = String(ev.skillId).slice(0, 4)
                let bucket = log.eidSkills.get(eid)
                if (!bucket) {
                    bucket = new Map()
                    log.eidSkills.set(eid, bucket)
                }
                bucket.set(pre, (bucket.get(pre) ?? 0) + 1)
                log.skillEvents.push({ t, eid, pre, sid: String(ev.skillId) })
                break
            }
            case "panelSkill": {
                const sid = ev.skillId
                const cid = sid > 0 ? Math.floor(sid / 100) : 0
                if (cid && getIndexes().charById.has(cid)) log.mainChars.push({ t, skillId: sid, charId: cid })
                break
            }
            case "slotSet": {
                // P11：只接受玩家/协战角色的 SetName，BOSS 召唤物会污染 pendingActor
                const bp = ev.bp ?? null
                if (bp && /^BP_(PlayerCharacter|PhantomCharacter)/.test(bp)) {
                    pendingActor = { bp, line: ev.slot }
                    if (bp.includes("PlayerCharacter")) log.mainActors.push({ t, bp, raw: ev.slot })
                }
                break
            }
            case "slotName":
                slotCur = { t, actor: pendingActor, key: ev.key, en: null, text: null }
                log.slots.push(slotCur)
                break
            case "slotEn":
                if (slotCur) slotCur.en = ev.code
                break
            case "slotText":
                if (slotCur) slotCur.text = ev.text.trim()
                break
            case "riftInit":
                log.rift.push({ t, type: "init" })
                break
            case "riftTimer":
                log.rift.push({ t, type: "timer", total: ev.totalTime })
                break
            case "riftEnterRoom":
                log.rift.push({ t, type: "enter", room: ev.roomId })
                break
            case "riftSpawn":
                log.rift.push({ t, type: "spawn", room: ev.roomId, spawnId: ev.spawnId })
                break
            case "riftClear":
                log.rift.push({ t, type: "clear", room: ev.roomId })
                break
            case "riftTotal":
                log.rift.push({ t, type: "total" })
                break
            case "riftBossPick":
                log.rift.push({ t, type: "bossPick", unitId: ev.unitId })
                break
            case "riftBossActive":
                log.rift.push({ t, type: "bossActive", eid: ev.eid, unitId: ev.unitId })
                break
            case "riftBossDead":
                log.rift.push({ t, type: "bossDead" })
                break
        }
    }

    // 死亡原因按 objId + Eid 补挂（objId 会被对象池复用，不能只按 objId）
    for (const k of log.kills) {
        if (!k.reason) {
            const reason = log.reasons.get(`${k.objId}|${k.eid != null ? k.eid : ""}`)
            if (reason) k.reason = reason
        }
    }
    sortByT(log.spawns)
    sortByT(log.unitCreates)
    sortByT(log.aiCreates)
    sortByT(log.alive)
    sortByT(log.teams)
    sortByT(log.mvp)
    sortByT(log.mvpMetas)
    sortByT(log.factors)
    sortByT(log.levels)
    sortByT(log.dungeonMaps)
    sortByT(log.hardBosses)
    sortByT(log.regionMarks)
    sortByT(log.taskbarEvents)
    sortByT(log.loot)
    sortByT(log.rewardRates)
    sortByT(log.preloads)
    sortByT(log.quotas)
    sortByT(log.hits)
    sortByT(log.rift)
    sortByT(log.skillEvents)
    return log
}

/* ---------- 通用时间工具 ---------- */

function sortByT<T extends { t: number }>(arr: T[]) {
    arr.sort((a, b) => a.t - b.t)
}

function lowerBound<T extends { t: number }>(arr: T[], t: number) {
    let lo = 0
    let hi = arr.length
    while (lo < hi) {
        const mid = (lo + hi) >> 1
        if (arr[mid].t < t) lo = mid + 1
        else hi = mid
    }
    return lo
}

function upperBound<T extends { t: number }>(arr: T[], t: number) {
    let lo = 0
    let hi = arr.length
    while (lo < hi) {
        const mid = (lo + hi) >> 1
        if (arr[mid].t <= t) lo = mid + 1
        else hi = mid
    }
    return lo
}

function sliceByTime<T extends { t: number }>(arr: T[], from: number, to: number) {
    return arr.slice(lowerBound(arr, from), upperBound(arr, to))
}

/* ---------- 分段：按结算切分，起点锚定在进副本 / 进战 ---------- */

interface Anchor {
    t: number
    kind: "dungeon" | "hardboss"
    dungeonId: number | null
    mode: string | null
    boss: number | null
    diff: number | null
    floorId: number | null
    level: number | null
}

interface Segment {
    i: number
    start: number
    enterT: number
    end: number
    kills: ParsedKill[]
    anchor: Anchor | null
    dungeonId: number | null
    rawDungeonId: number | null
    win: boolean | null
    playerTime: number | null
    elapsed: number | null
    settleT: number | null
    level: { name: string; type: string; lv: number } | null
    gameName: string | null
    mapId: string | null
    mapCn: string | null
    floor: SessionInfo["floor"]
    hardBoss: { boss: number; diff: number; level: number; name: string | null; region: string | null } | null
    regionId: number | null
    regionCn: string | null
}

function dungeonInfo(id: number | null) {
    if (id == null || id <= 0) return null
    return getIndexes().dungeonById.get(id) ?? null
}

function regionOf(levelId: string | null) {
    if (!levelId) return null
    const parts = levelId.split("_")
    for (let n = parts.length; n > 0; n--) {
        const hit = getIndexes().regionPrefix.get(parts.slice(0, n).join("_"))
        if (hit) return hit
    }
    return null
}

function subregionName(id: number | null) {
    if (id == null) return null
    const index = getIndexes()
    const sub = index.subregionById.get(id)
    if (!sub) return null
    const region = index.regionNameById.get(sub.rid)
    return region ? `${region}·${sub.name}` : sub.name
}

function buildAnchors(log: LogData): Anchor[] {
    const list: Anchor[] = []
    for (const e of log.enters) {
        if (e.dungeonId == null && !e.mode) continue
        list.push({ t: e.t, kind: "dungeon", dungeonId: e.dungeonId, mode: e.mode, boss: null, diff: null, floorId: null, level: null })
    }
    for (const hb of log.hardBosses) {
        list.push({ t: hb.t, kind: "hardboss", dungeonId: null, mode: null, boss: hb.boss, diff: hb.diff, floorId: null, level: null })
    }
    for (const sr of log.soloRaids) {
        list.push({
            t: sr.t,
            kind: "dungeon",
            dungeonId: sr.dungeonId,
            mode: "SoloRaid",
            boss: null,
            diff: null,
            floorId: sr.floorId,
            level: sr.level,
        })
    }
    list.sort((a, b) => a.t - b.t)
    const merged: Anchor[] = []
    for (const a of list) {
        const prev = merged[merged.length - 1]
        if (prev && a.kind === "dungeon" && prev.kind === "dungeon" && a.t - prev.t < 30) {
            if (a.dungeonId != null) prev.dungeonId = a.dungeonId
            if (a.mode) prev.mode = a.mode
            if (a.floorId != null) {
                prev.floorId = a.floorId
                prev.level = a.level
            }
            continue
        }
        merged.push(a)
    }
    return merged
}

function pickMap(log: LogData, seg: Segment) {
    const mapIndex = upperBound(log.dungeonMaps, seg.start + 4) - 1
    if (mapIndex >= 0) return log.dungeonMaps[mapIndex].id
    const levelIndex = upperBound(log.levels, seg.start + 2) - 1
    return levelIndex >= 0 ? log.levels[levelIndex].id : null
}

function pickHardBoss(log: LogData, seg: Segment) {
    const near = sliceByTime(log.hardBosses, seg.start - 300, seg.end + 20)
    return near.length ? near[near.length - 1] : null
}

function dedupeKills(kills: ParsedKill[]): ParsedKill[] {
    const seen = new Map<string, ParsedKill>()
    const out: ParsedKill[] = []
    for (const k of kills) {
        const key = k.eid != null ? `${k.objId}|${k.eid}` : `${k.objId}|t${Math.floor(k.t)}`
        const prev = seen.get(key)
        if (prev) {
            if (prev.x === null && k.x !== null) {
                prev.x = k.x
                prev.y = k.y
                prev.z = k.z
            }
            if (prev.reason == null && k.reason != null) prev.reason = k.reason
            continue
        }
        seen.set(key, k)
        out.push(k)
    }
    return out.sort((a, b) => a.t - b.t)
}

function buildSegments(log: LogData): Segment[] {
    const all = dedupeKills(log.kills)
    if (!all.length) return []

    const settles: SettleRecord[] = []
    for (const s of log.settles.slice().sort((a, b) => a.t - b.t)) {
        const prev = settles[settles.length - 1]
        const same = prev && s.t - prev.t < 25 && (s.dungeonId === prev.dungeonId || s.dungeonId <= 0 || prev.dungeonId <= 0)
        if (same) {
            if (!prev.playerTime && s.playerTime) prev.playerTime = s.playerTime
            if (!prev.elapsed && s.elapsed) prev.elapsed = s.elapsed
            if (prev.win == null) prev.win = s.win
            continue
        }
        settles.push({ t: s.t, dungeonId: s.dungeonId, win: s.win, playerTime: s.playerTime, elapsed: s.elapsed })
    }

    const anchors = buildAnchors(log)
    const usedAnchor = new Set<number>()
    const pickAnchor = (t: number) => {
        for (let i = anchors.length - 1; i >= 0; i--) {
            if (usedAnchor.has(i)) continue
            if (anchors[i].t > t + 0.001) continue
            usedAnchor.add(i)
            return anchors[i]
        }
        return null
    }

    const segs: Segment[] = []
    let start = all[0].t

    const make = (ks: ParsedKill[], settle: SettleRecord | null, anchor: Anchor | null): Segment => {
        // 进行中的尾段没有结算行，副本信息只能来自进本锚点；
        // 否则会退回地图名（如「净界岛」），与副本名不一致。
        const dungeonId = settle
            ? settle.dungeonId > 0
                ? settle.dungeonId
                : null
            : anchor?.dungeonId != null && anchor.dungeonId > 0
              ? anchor.dungeonId
              : null
        const seg: Segment = {
            i: 0,
            start: ks[0].t,
            enterT: anchor ? anchor.t : ks[0].t,
            end: ks[ks.length - 1].t,
            kills: ks,
            anchor: anchor ? { ...anchor, floorId: anchor.floorId, level: anchor.level } : null,
            dungeonId,
            rawDungeonId: settle ? settle.dungeonId : null,
            win: settle ? settle.win : null,
            playerTime: settle ? settle.playerTime : null,
            elapsed: settle ? settle.elapsed || null : null,
            settleT: settle ? settle.t : null,
            level: null,
            gameName: null,
            mapId: null,
            mapCn: null,
            floor: null,
            hardBoss: null,
            regionId: null,
            regionCn: null,
        }
        seg.level = dungeonInfo(seg.dungeonId)
        seg.gameName = (seg.dungeonId != null && log.dungeonNames.get(seg.dungeonId)) || null
        seg.mapId = pickMap(log, seg)
        seg.mapCn = regionOf(seg.mapId)

        if (anchor && anchor.floorId != null) {
            const rf = RaidFloor[anchor.floorId]
            if (rf) {
                seg.floor = {
                    floorId: anchor.floorId,
                    floor: rf.Floor,
                    monsterLevel: rf.MonsterLevel,
                    recLevel: rf.RecLevel,
                    season: rf.RaidSeason,
                }
            }
        }

        if (seg.dungeonId == null) {
            const hb = anchor && anchor.kind === "hardboss" ? anchor : pickHardBoss(log, seg)
            if (hb && hb.boss != null && hb.diff != null) {
                const ev = log.taskbarEvents.filter(e => e.id === 0 && e.t >= hb.t - 3 && e.t <= hb.t + 90 && e.status === "enter").pop()
                seg.hardBoss = {
                    boss: hb.boss,
                    diff: hb.diff,
                    level: getIndexes().hardBossLevel.get(hb.diff) ?? 0,
                    name: ev ? ev.name : null,
                    region: null,
                }
                const mark = log.regionMarks.filter(m => m.t <= hb.t + 3).pop()
                seg.regionId = mark ? mark.id : null
                seg.regionCn = subregionName(seg.regionId)
                seg.hardBoss.region = seg.regionCn
                if (!(seg.playerTime != null && seg.playerTime > 0)) seg.playerTime = Math.max(0, seg.end - hb.t)
            }
        }
        return seg
    }

    for (const s of settles) {
        if (s.t < start + 0.001) continue
        const anchor = pickAnchor(s.t)
        const from = anchor ? anchor.t : start
        const fromIndex = lowerBound(all, from - 0.001)
        const toIndex = upperBound(all, s.t + 0.001)
        const ks = all.slice(fromIndex, toIndex)
        if (ks.length) segs.push(make(ks, s, anchor))
        start = s.t
    }

    const tail = all.slice(upperBound(all, start + 0.001))
    if (tail.some(k => !isSummonByBp(k))) {
        const anchor = pickAnchor(Number.POSITIVE_INFINITY)
        const from = anchor ? anchor.t : start
        const ks = all.slice(lowerBound(all, from - 0.001))
        if (ks.length) segs.push(make(ks, null, anchor))
    }

    for (let i = 0; i < segs.length; i++) segs[i].i = i
    return segs
}

/* ---------- 按局反查 Eid → 角色 ---------- */

interface EidChar {
    id: number | null
    cn: string | null
    code: string | null
    casts: number
}

function buildEidChars(log: LogData, from: number, to: number): Map<number, EidChar> {
    const charById = getIndexes().charById
    const counts = new Map<number, Map<string, number>>()
    const lo = lowerBound(log.skillEvents, from)
    const hi = upperBound(log.skillEvents, to)
    for (let i = lo; i < hi; i++) {
        const ev = log.skillEvents[i]
        if (!charById.has(Number(ev.pre))) continue
        let bucket = counts.get(ev.eid)
        if (!bucket) {
            bucket = new Map()
            counts.set(ev.eid, bucket)
        }
        bucket.set(ev.pre, (bucket.get(ev.pre) ?? 0) + 1)
    }
    const out = new Map<number, EidChar>()
    for (const [eid, bucket] of counts) {
        let best: string | null = null
        let bestN = 0
        for (const [pre, n] of bucket) {
            if (n > bestN) {
                best = pre
                bestN = n
            }
        }
        if (!best) continue
        const ch = charById.get(Number(best))
        out.set(eid, { id: Number(best), cn: ch?.name ?? null, code: ch?.code ?? null, casts: bestN })
    }
    return out
}

function buildGlobalEidChars(log: LogData) {
    return buildEidChars(log, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY)
}

/* ---------- 派生指标 ---------- */

const SUMMON_GONE = new Set(["SummonMax", "SummonRemove", "SummonTimeLife", "ClearSummons"])

function isSummonReason(k: ParsedKill) {
    return k.reason != null && SUMMON_GONE.has(k.reason)
}

function isSummon(k: ParsedKill, mob: ResolvedMob) {
    return mob.kind === 3 || isSummonReason(k)
}

function isSummonByBp(k: ParsedKill) {
    return resolveMonster(k.bp).kind === 3 || isSummonReason(k)
}

function isBossKill(mob: ResolvedMob) {
    return mob.kind === 2
}

function lastSlotGroup(list: SlotRecord[]) {
    if (!list.length) return []
    const sorted = list.slice().sort((a, b) => a.t - b.t)
    let start = 0
    for (let i = 1; i < sorted.length; i++) if (sorted[i].t - sorted[i - 1].t > 20) start = i
    return sorted.slice(start)
}

function latestRecord<T extends { t: number }>(list: T[] | undefined, maxT: number): T | null {
    if (!list?.length) return null
    // 创建行可能比死亡行晚几十毫秒（同帧先后），向前放宽 5 秒
    const hi = upperBound(list, maxT)
    return hi > 0 ? list[hi - 1] : null
}

function lookupUnitId(
    aiByEid: Map<number, AiCreateRecord[]>,
    createsByEid: Map<number, UnitCreateRecord[]>,
    eid: number | null,
    t: number
) {
    if (eid == null || eid <= 0) return null
    // P8/P9：CreateAIUnit 的 Eid→UnitId 最可靠；没有时退回 CreateUnitSuccess(UnitType=Monster)
    const ai = latestRecord(aiByEid.get(eid), t + MERGE_WIN)
    if (ai) return ai.unitId
    return latestRecord(createsByEid.get(eid), t + MERGE_WIN)?.unitId ?? null
}

function buildSegmentCreates(log: LogData, from: number, to: number) {
    const map = new Map<number, UnitCreateRecord[]>()
    for (const u of sliceByTime(log.unitCreates, from, to)) {
        if (u.unitType !== "Monster" || u.eid <= 0) continue
        const list = map.get(u.eid) ?? []
        list.push(u)
        map.set(u.eid, list)
    }
    return map
}

function buildSegmentAiCreates(log: LogData, from: number, to: number) {
    const map = new Map<number, AiCreateRecord[]>()
    for (const u of sliceByTime(log.aiCreates, from, to)) {
        if (u.eid <= 0) continue
        const list = map.get(u.eid) ?? []
        list.push(u)
        map.set(u.eid, list)
    }
    return map
}

function pct(arr: number[], p: number) {
    if (!arr.length) return 0
    const sorted = arr.slice().sort((a, b) => a - b)
    const i = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)))
    return sorted[i]
}

interface Bounds {
    x0: number
    x1: number
    y0: number
    y1: number
}

function robustBounds(pts: Array<{ x: number; y: number }>): Bounds | null {
    if (!pts.length) return null
    const xs = pts.map(p => p.x)
    const ys = pts.map(p => p.y)
    let lo = pct(xs, 0.01)
    let hi = pct(xs, 0.99)
    let loy = pct(ys, 0.01)
    let hiy = pct(ys, 0.99)
    if (hi - lo < 1) {
        const c = (lo + hi) / 2
        lo = c - 0.5
        hi = c + 0.5
    }
    if (hiy - loy < 1) {
        const c = (loy + hiy) / 2
        loy = c - 0.5
        hiy = c + 0.5
    }
    const padx = (hi - lo) * 0.12
    const pady = (hiy - loy) * 0.12
    return { x0: lo - padx, x1: hi + padx, y0: loy - pady, y1: hiy + pady }
}

function mergeBounds(a: Bounds | null, b: Bounds | null): Bounds | null {
    if (!a && !b) return null
    if (!a) return b
    if (!b) return a
    return {
        x0: Math.min(a.x0, b.x0),
        x1: Math.max(a.x1, b.x1),
        y0: Math.min(a.y0, b.y0),
        y1: Math.max(a.y1, b.y1),
    }
}

function hotConcentration(pts: Array<{ x: number; y: number }>, bounds: Bounds | null): ConcentrationInfo | null {
    if (!pts.length || !bounds) return null
    const N = 12
    const grid = new Array<number>(N * N).fill(0)
    let inside = 0
    for (const p of pts) {
        const gx = Math.floor(((p.x - bounds.x0) / (bounds.x1 - bounds.x0)) * N)
        const gy = Math.floor(((p.y - bounds.y0) / (bounds.y1 - bounds.y0)) * N)
        if (gx < 0 || gy < 0 || gx >= N || gy >= N) continue
        grid[gy * N + gx]++
        inside++
    }
    if (!inside) return null
    const sorted = grid.slice().sort((a, b) => b - a)
    const top = Math.max(1, Math.round(N * N * 0.12))
    let sum = 0
    for (let i = 0; i < top; i++) sum += sorted[i]
    return {
        cells: sorted.filter(v => v > 0).length,
        grid: N,
        peak: sorted[0] / inside,
        share: sum / inside,
        inside,
        gridValues: grid,
    }
}

/* ---------- 螺旋秘境阶段 ---------- */

interface RiftPhase {
    roomCount: number
    mobPhase: number
    bossPhase: number | null
    gapToBoss: number | null
    bossName: string | null
    bossUnitId: number | null
    totalT: number | null
    bossPickT: number | null
    bossActiveT: number | null
    bossDeadT: number | null
    bossKillN: number
    mobKillN: number
    hasInit: boolean
}

function riftPhases(
    events: RiftRecord[],
    kills: ParsedKill[],
    t0: number,
    bossKills: ParsedKill[],
    mobOf: (k: ParsedKill) => ResolvedMob
): RiftPhase | null {
    if (!events.length) return null
    const roomMap = new Map<
        number,
        { id: number; enterT: number | null; spawnT: number | null; clearT: number | null; spawnIds: number[] }
    >()
    let totalT: number | null = null
    let bossPickT: number | null = null
    let bossActiveT: number | null = null
    let bossDeadT: number | null = null
    let bossUnitId: number | null = null
    let hasInit = false
    for (const e of events) {
        if (e.type === "init") hasInit = true
        else if (e.type === "total") {
            if (totalT == null) totalT = e.t
        } else if (e.type === "bossPick") {
            if (bossPickT == null) {
                bossPickT = e.t
                bossUnitId = e.unitId
            }
        } else if (e.type === "bossActive") {
            if (bossActiveT == null) {
                bossActiveT = e.t
                bossUnitId = e.unitId || bossUnitId
            }
        } else if (e.type === "bossDead") {
            if (bossDeadT == null) bossDeadT = e.t
        } else if (e.type === "enter" || e.type === "spawn" || e.type === "clear") {
            const room = e.room
            const cur = roomMap.get(room) ?? { id: room, enterT: null, spawnT: null, clearT: null, spawnIds: [] }
            if (e.type === "enter" && cur.enterT == null) cur.enterT = e.t
            if (e.type === "spawn") {
                if (cur.spawnT == null) cur.spawnT = e.t
                if (e.spawnId != null && cur.spawnIds.indexOf(e.spawnId) === -1) cur.spawnIds.push(e.spawnId)
            }
            if (e.type === "clear") cur.clearT = e.t
            roomMap.set(room, cur)
        }
    }
    const rooms = [...roomMap.values()].sort((a, b) => a.id - b.id)
    if (!rooms.length && bossActiveT == null) return null

    for (let i = 0; i < rooms.length; i++) {
        const room = rooms[i]
        if (room.clearT == null) {
            if (i + 1 < rooms.length && rooms[i + 1].enterT != null) room.clearT = rooms[i + 1].enterT
            else if (totalT != null) room.clearT = totalT
            else if (bossActiveT != null) room.clearT = bossActiveT
        }
    }

    const roomOut = rooms.map(room => {
        const spawnStart = room.spawnT != null ? room.spawnT : room.enterT != null ? room.enterT : t0
        const startAbs = Math.max(t0, room.enterT != null ? room.enterT : spawnStart)
        const killStart = Math.max(t0, spawnStart)
        const endAbs = room.clearT != null ? room.clearT : bossActiveT != null ? bossActiveT : startAbs
        const n = kills.filter(k => k.t >= killStart && k.t < Math.max(killStart, endAbs)).length
        return {
            id: room.id,
            start: Math.max(0, startAbs - t0),
            end: Math.max(0, (endAbs || startAbs) - t0),
            dur: Math.max(0, (endAbs || startAbs) - startAbs),
            kills: n,
            spawnIds: room.spawnIds,
        }
    })

    const firstStart = roomOut.length ? Math.min(...roomOut.map(r => r.start)) : 0
    const mobEnd = totalT != null ? totalT : bossActiveT != null ? bossActiveT : roomOut.length ? roomOut[roomOut.length - 1].end + t0 : t0
    const mobPhase = Math.max(0, mobEnd - (t0 + firstStart))
    const bossStartKill = bossKills.length ? bossKills[0].t : bossDeadT
    const bossPhase = bossActiveT != null && bossStartKill != null && bossStartKill >= bossActiveT ? bossStartKill - bossActiveT : null
    const bossKillN = bossActiveT != null ? kills.filter(k => k.t >= bossActiveT).length : 0
    const mobKillN = kills.length - bossKillN

    return {
        roomCount: roomOut.length,
        mobPhase,
        bossPhase,
        gapToBoss: totalT != null && bossActiveT != null ? Math.max(0, bossActiveT - totalT) : null,
        bossName: bossKills.length ? mobOf(bossKills[0]).name : null,
        bossUnitId,
        totalT: totalT != null ? Math.max(0, totalT - t0) : null,
        bossPickT: bossPickT != null ? Math.max(0, bossPickT - t0) : null,
        bossActiveT: bossActiveT != null ? Math.max(0, bossActiveT - t0) : null,
        bossDeadT: bossDeadT != null ? Math.max(0, bossDeadT - t0) : null,
        bossKillN,
        mobKillN,
        hasInit,
    }
}

/* ---------- 单局指标 ---------- */

function buildEvents(log: LogData, seg: Segment, bossLevelName: string | null): EventRow[] {
    const from = seg.enterT - 2
    const to = (seg.settleT ?? seg.end) + 20
    const out: EventRow[] = []
    const seen = new Set<string>()
    const push = (row: EventRow) => {
        const key = `${row.kind}|${row.title}|${row.detail ?? ""}|${row.t}`
        if (seen.has(key)) return
        seen.add(key)
        out.push(row)
    }
    if (seg.anchor) {
        if (seg.anchor.kind === "hardboss") {
            const hb = seg.hardBoss
            push({
                t: seg.anchor.t,
                kind: "boss",
                title: "大世界 BOSS 进战",
                detail: `${bossLevelName ?? `BOSS ${seg.anchor.boss}`}${hb ? ` · 难度 ${hb.diff}` : ""}`,
            })
        } else {
            push({
                t: seg.enterT,
                kind: "enter",
                title: "进入副本",
                detail:
                    seg.gameName ?? seg.level?.name ?? (seg.dungeonId != null ? `副本 ${seg.dungeonId}` : (seg.anchor.mode ?? undefined)),
            })
        }
    }
    let lastRegionId: number | null = null
    for (const r of sliceByTime(log.regionMarks, from, to)) {
        if (r.id === lastRegionId) continue
        lastRegionId = r.id
        push({ t: r.t, kind: "region", title: "区域变化", detail: subregionName(r.id) ?? `区域 ${r.id}` })
    }
    for (const e of sliceByTime(log.taskbarEvents, from, to)) {
        if (e.id !== 0 && e.id !== seg.dungeonId) continue
        push({
            t: e.t,
            kind: "taskbar",
            title: e.status === "enter" ? "任务栏进入" : e.status === "complete" ? "任务栏完成" : "任务栏状态",
            detail: e.name || `副本 ${e.id}`,
        })
    }
    if (seg.anchor?.kind !== "hardboss") {
        for (const hb of sliceByTime(log.hardBosses, from, to)) {
            push({ t: hb.t, kind: "boss", title: "大世界 BOSS 进战", detail: `BOSS ${hb.boss} · 难度 ${hb.diff}` })
        }
    }
    for (const team of sliceByTime(log.teams, from, to)) {
        push({
            t: team.t,
            kind: "team",
            title: "刷怪组",
            detail: `第 ${team.index} 队 · UnitSpawnId ${team.unitSpawnId} · ${team.teamLocs} 个刷新点`,
        })
    }
    for (const e of sliceByTime(log.rift, from, to)) {
        const titles: Record<RiftRecord["type"], string> = {
            init: "秘境开启",
            timer: "秘境计时",
            enter: "进入房间",
            spawn: "房间刷怪",
            clear: "房间达标",
            total: "总分达标",
            bossPick: "最终 BOSS 抽取",
            bossActive: "最终 BOSS 激活",
            bossDead: "最终 BOSS 击破",
        }
        const detail =
            e.type === "timer"
                ? `总时长 ${e.total}s`
                : e.type === "enter" || e.type === "clear"
                  ? `房间 ${e.room}`
                  : e.type === "spawn"
                    ? `房间 ${e.room} · Spawn ${e.spawnId}`
                    : e.type === "bossPick" || e.type === "bossActive"
                      ? `UnitId ${e.unitId}`
                      : undefined
        push({ t: e.t, kind: `rift-${e.type}`, title: titles[e.type], detail })
    }
    for (const loot of sliceByTime(log.loot, from, to)) {
        push({ t: loot.t, kind: "reward", title: "战利品", detail: `${loot.name} ×${loot.count}` })
    }
    if (seg.settleT != null) {
        push({
            t: seg.settleT,
            kind: "settle",
            title: "副本结算",
            detail: `${seg.win === false ? "失败" : "胜利"}${seg.playerTime != null && seg.playerTime > 0 ? ` · 用时 ${seg.playerTime.toFixed(2)}s` : ""}`,
        })
    }
    return out.sort((a, b) => a.t - b.t)
}

function computeSession(ctx: Context, seg: Segment, segEid: Map<number, EidChar>, globalEid: Map<number, EidChar>): AnalysisSession {
    const log = ctx.log
    const segEnd = seg.settleT != null ? seg.settleT : seg.end
    // Eid 会跨局复用：UnitId 映射只认本局时窗内的创建行
    const segmentAi = buildSegmentAiCreates(log, seg.enterT - 2, segEnd + 5)
    const segmentCreates = buildSegmentCreates(log, seg.enterT - 2, segEnd + 5)
    const mobCache = new Map<ParsedKill, ResolvedMob>()
    const mobOf = (k: ParsedKill) => {
        const cached = mobCache.get(k)
        if (cached) return cached
        const unitId = lookupUnitId(segmentAi, segmentCreates, k.eid, k.t)
        const info = resolveMonster(k.bp, unitId)
        const resolved: ResolvedMob = { name: info.name, kind: info.kind, unitId }
        mobCache.set(k, resolved)
        return resolved
    }
    const allDead = seg.kills.slice()
    const kills = allDead.filter(k => !isSummon(k, mobOf(k)))
    const summons = allDead.filter(k => isSummon(k, mobOf(k)))
    const toKillEntry = (k: ParsedKill): KillEntry => {
        const mob = mobOf(k)
        return {
            t: k.t,
            bp: k.bp,
            objId: k.objId,
            eid: k.eid,
            unitId: mob.unitId,
            name: mob.name,
            kind: mob.kind,
            reason: k.reason,
            x: k.x,
            y: k.y,
            z: k.z,
        }
    }

    const segEnd0 = seg.settleT != null ? seg.settleT : seg.end
    const segOpen = seg.enterT != null ? seg.enterT : seg.start
    const slotEnd = Math.min(segOpen + 60, segEnd0 + 5)
    const slotFrom = segOpen - 120
    const inWin = (t: number) => t >= slotFrom && t <= slotEnd

    const mainSlots = log.mainActors.filter(s => inWin(s.t))
    const mainSlot = mainSlots.length ? mainSlots[mainSlots.length - 1] : null
    const phantomSlots = lastSlotGroup(log.slots.filter(s => s.text && inWin(s.t)))

    const panelFrom = segOpen - 300
    const panelTo = segOpen + 30
    const panel = log.mainChars.filter(m => m.t >= panelFrom && m.t <= panelTo)
    const panelHit = panel.length ? panel[panel.length - 1] : null
    const eid1 = segEid.get(1)
    const mainSlotEid = mainSlot?.bp != null ? (log.eidOfActor.get(mainSlot.bp) ?? null) : null
    const mainSlotChar = mainSlotEid != null ? (globalEid.get(mainSlotEid) ?? null) : null
    let mainChar: { id: number | null; cn: string | null; eid: number | null; casts: number; source: string } | null = null
    if (eid1 && eid1.id != null) {
        mainChar = { id: eid1.id, cn: eid1.cn, eid: 1, casts: eid1.casts, source: "eid" }
    } else if (mainSlot && mainSlotChar?.id != null) {
        mainChar = { id: mainSlotChar.id, cn: mainSlotChar.cn, eid: mainSlotEid, casts: mainSlotChar.casts, source: "slot" }
    } else if (panelHit) {
        mainChar = {
            id: panelHit.charId,
            cn: getIndexes().charById.get(panelHit.charId)?.name ?? null,
            eid: null,
            casts: 0,
            source: "panel",
        }
    }

    const party: PartySlot[] = []
    if (mainChar) {
        party.push({
            slot: "main",
            name: mainChar.cn,
            en: null,
            bp: mainSlot?.bp ?? null,
            eid: mainChar.eid,
            charId: mainChar.id,
            casts: mainChar.casts,
            role: "main",
        })
    }
    for (const slot of phantomSlots) {
        const slotEid = slot.actor?.bp != null ? (log.eidOfActor.get(slot.actor.bp) ?? null) : null
        const kidMatch = /UI_CHAR_NAME_(\d+)/.exec(slot.key)
        const kid = kidMatch ? Number(kidMatch[1]) : 0
        const mainKey = kid === 101 || kid === 102
        const byEid = mainKey && slotEid != null ? segEid.get(slotEid) : null
        const eidChar = slotEid != null ? globalEid.get(slotEid) : null
        const charId = byEid?.id ?? (kid && getIndexes().charById.has(kid) ? kid : (eidChar?.id ?? null))
        const charName = byEid?.cn ?? (kid ? (getIndexes().charById.get(kid)?.name ?? null) : (eidChar?.cn ?? null))
        party.push({
            slot: slot.text ?? slot.key,
            name: slot.text ?? charName,
            en: slot.en,
            bp: slot.actor?.bp ?? null,
            eid: slotEid,
            charId,
            casts: byEid?.casts ?? 0,
            role: "phantom",
        })
    }

    const t0 = kills.length ? kills[0].t : 0
    const t1 = kills.length ? kills[kills.length - 1].t : 0
    // 异常时间戳（缺失 / 跨天 / 纪元切换）不能撑爆逐秒数组；单局按最多 24 小时计
    const rawSpan = t1 - t0
    const span = Number.isFinite(rawSpan) ? Math.max(0, Math.min(rawSpan, 86_400)) : 0

    const combatFrom = segOpen
    const combatTo = kills.length ? t1 + 0.5 : segEnd0
    const monsterCreates = sliceByTime(log.unitCreates, combatFrom, combatTo).filter(u => u.unitType === "Monster")
    const firstMonster = monsterCreates.length ? monsterCreates[0].t : null
    const hitWindow = sliceByTime(log.hits, combatFrom, combatTo)
    const firstHit = hitWindow.length ? hitWindow[0].t : null
    let combatStart: number | null = null
    if (kills.length) {
        const candidates = [firstMonster, firstHit, kills[0].t].filter((x): x is number => x != null)
        combatStart = candidates.length ? Math.min(...candidates) : kills[0].t
    }
    const combatDur = combatStart != null && kills.length ? Math.max(0, t1 - combatStart) : 0

    const perSec = new Array<number>(Math.ceil(span) + 1).fill(0)
    for (const k of kills) {
        const index = Math.min(perSec.length - 1, Math.floor(k.t - t0))
        if (index >= 0) perSec[index]++
    }
    const prefix = [0]
    for (let i = 0; i < perSec.length; i++) prefix.push(prefix[i] + perSec[i])
    const win3 = (i: number) => prefix[Math.min(perSec.length, i + 3)] - prefix[Math.min(perSec.length, i)]
    let peak3s = 0
    for (let i = 0; i < perSec.length; i++) peak3s = Math.max(peak3s, win3(i))

    const GAP = 3.5
    const rawBursts: Array<{ s: number; e: number; last: number; n: number }> = []
    let curBurst: { s: number; e: number; last: number; n: number } | null = null
    for (const k of kills) {
        const rel = k.t - t0
        if (!curBurst || k.t - curBurst.last > GAP) {
            curBurst = { s: rel, e: rel, last: k.t, n: 0 }
            rawBursts.push(curBurst)
        }
        curBurst.last = k.t
        curBurst.e = rel
        curBurst.n++
    }
    const bursts: BurstSegment[] = rawBursts.map(b => {
        let best = 0
        for (let i = Math.floor(b.s); i <= Math.ceil(b.e); i++) best = Math.max(best, win3(i))
        return { start: b.s, end: b.e, count: b.n, peak: best }
    })

    // 存活时长：生成行与击杀行按 objId 配对，取击杀之前最近一次生成
    const spawnsByObj = new Map<number, number[]>()
    const segSpawns = seg ? sliceByTime(log.spawns, segOpen - 2, seg.end + 4) : log.spawns
    for (const spawn of segSpawns) {
        const list = spawnsByObj.get(spawn.objId) ?? []
        list.push(spawn.t)
        spawnsByObj.set(spawn.objId, list)
    }
    for (const list of spawnsByObj.values()) list.sort((a, b) => a - b)
    const lifetimes: number[] = []
    for (const k of allDead) {
        const list = spawnsByObj.get(k.objId)
        if (!list?.length) continue
        let st: number | null = null
        for (let i = list.length - 1; i >= 0; i--) {
            if (list[i] <= k.t + 0.001) {
                st = list[i]
                break
            }
        }
        if (st !== null && k.t - st <= 600) lifetimes.push(Math.max(0, k.t - st))
    }
    const lifeSorted = lifetimes.slice().sort((a, b) => a - b)
    const lifetime = lifeSorted.length
        ? {
              med: pct(lifeSorted, 0.5),
              avg: lifeSorted.reduce((a, b) => a + b, 0) / lifeSorted.length,
              p90: pct(lifeSorted, 0.9),
          }
        : null

    const compMap = new Map<string, { count: number; mob: ResolvedMob }>()
    for (const k of kills) {
        const cur = compMap.get(k.bp)
        if (cur) cur.count++
        else compMap.set(k.bp, { count: 1, mob: mobOf(k) })
    }
    const composition: CompositionRow[] = [...compMap.entries()]
        .map(([, entry]) => ({
            name: entry.mob.name,
            kind: entry.mob.kind,
            count: entry.count,
            pct: kills.length ? (entry.count / kills.length) * 100 : 0,
        }))
        .sort((a, b) => b.count - a.count)

    const bossKills = kills.filter(k => isBossKill(mobOf(k)))
    // P8：BOSS 出生点按 Eid→UnitId 关联，优先 CreateUnitSuccess 坐标，缺失时用 CreateAIUnit 的时刻
    const bossSpawns: Array<BossSpawnPoint | null> = bossKills.map(k => {
        if (k.eid != null) {
            const ai = latestRecord(segmentAi.get(k.eid), k.t + MERGE_WIN)
            const create = latestRecord(segmentCreates.get(k.eid), k.t + MERGE_WIN)
            // P8：aiCreate 是首选关联；坐标只能来自 CreateUnitSuccess 的 Loc
            if (ai) return { t: ai.t, x: create?.x ?? null, y: create?.y ?? null, z: create?.z ?? null, unitId: ai.unitId }
            if (create) return { t: create.t, x: create.x, y: create.y, z: create.z, unitId: create.unitId }
        }
        // 旧日志兜底：死亡的 CreatorId 即单位 ID（仅当确实存在该 UnitId 的创建行）
        if (k.creatorId != null && k.creatorId > 0) {
            const fallback = sliceByTime(log.unitCreates, seg.enterT - 2, k.t + MERGE_WIN)
                .filter(u => u.unitType === "Monster" && u.unitId === k.creatorId)
                .pop()
            if (fallback) return { t: fallback.t, x: fallback.x, y: fallback.y, z: fallback.z, unitId: fallback.unitId }
        }
        return null
    })

    // 结算榜只取本段时窗内的记录
    const inSeg = (t: number) => t >= seg.start - 6 && t <= segEnd + 20
    const damageRecords = log.mvp.filter(p => inSeg(p.t))
    const byIdx = new Map<number, MvpRecord>()
    for (const p of damageRecords) byIdx.set(p.index, p)
    const boardRows = [...byIdx.values()].sort((a, b) => b.damage - a.damage)
    const totalDamage = boardRows.reduce((sum, p) => sum + p.damage, 0)
    const metas = log.mvpMetas.filter(x => inSeg(x.t))
    const factors = log.factors.filter(x => inSeg(x.t))
    const mvpMeta = metas.length ? metas[metas.length - 1] : null
    const factor = factors.length ? factors[factors.length - 1].value : null
    const board: DamageRow[] = boardRows.map((p, index) => ({
        name: p.name,
        damage: p.damage,
        score: p.score,
        pct: totalDamage > 0 ? (p.damage / totalDamage) * 100 : 0,
        dps: combatDur > 0 ? p.damage / combatDur : 0,
        mvp: index === 0,
    }))

    const rates = log.rewardRates.filter(x => inSeg(x.t))
    let bonus: number | null = null
    let expRate: number | null = null
    for (const rate of rates) {
        if (rate.kind === "bonus") bonus = rate.value
        else expRate = rate.value
    }
    const rewardRate = bonus != null || expRate != null ? { bonus: bonus ?? 0, exp: expRate ?? 0 } : null

    // 预加载 / 配额是进本时打印的；只认进本前 1.5 秒到结算，避免把上一局资源算进来
    const preloadMap = new Map<number, number>()
    for (const pre of sliceByTime(log.preloads, segOpen - 1.5, segEnd0)) {
        preloadMap.set(pre.unitId, Math.max(preloadMap.get(pre.unitId) ?? 0, pre.count))
    }
    const preloads: PreloadRow[] = [...preloadMap.entries()]
        .map(([unitId, count]) => ({ unitId, name: unitLabel(unitId), count }))
        .sort((a, b) => b.count - a.count)
    const quotas: QuotaRow[] = sliceByTime(log.quotas, segOpen - 1.5, segEnd0).map(q => ({
        unitSpawnId: q.unitSpawnId,
        needBefore: q.needBefore,
        quotaLeft: q.quotaLeft,
        totalNeed: q.totalNeed,
    }))
    const lootMap = new Map<string, LootRow>()
    for (const item of sliceByTime(log.loot, segOpen - 2, segEnd0 + 20)) {
        const key = `${item.id}|${item.rarity}|${item.name}`
        const row = lootMap.get(key)
        if (row) row.count += item.count
        else lootMap.set(key, { id: item.id, name: item.name, rarity: item.rarity, count: item.count })
    }
    const loot = [...lootMap.values()].sort((a, b) => b.rarity - a.rarity || b.count - a.count)

    // 本局时窗内的螺旋秘境事件
    const riftFrom = seg.enterT != null ? seg.enterT - 2 : seg.start - 45
    const riftEvents = log.rift.filter(e => e.t >= riftFrom && e.t <= segEnd0 + 20)
    const riftPhase = riftPhases(riftEvents, kills, t0, bossKills, mobOf)
    const rift = riftPhase
        ? {
              rooms: riftPhase.roomCount,
              mobPhase: riftPhase.mobPhase,
              gapToBoss: riftPhase.gapToBoss,
              bossName: riftPhase.bossName,
              finalBossDead: riftPhase.bossDeadT != null,
          }
        : null

    // 刷怪供需（限定在本段时窗内）
    const aliveSeries = sliceByTime(log.alive, segOpen - 2, seg.end + 4).map(a => ({
        t: a.t - t0,
        alive: a.aliveSum,
        total: a.totalNeed,
    }))
    const teamSpawns = sliceByTime(log.teams, segOpen - 2, seg.end + 4)

    // 累计供给：SpawnNextTeam 批次 + 怪物预加载；都没有时退回单体生成行
    const supply: Array<{ t: number; n: number }> = []
    for (const team of teamSpawns) supply.push({ t: team.t, n: Math.max(1, team.teamLocs) })
    for (const pre of sliceByTime(log.preloads, segOpen - 2, seg.end + 4)) {
        if (getIndexes().monsterById.has(pre.unitId)) supply.push({ t: pre.t, n: pre.count })
    }
    if (!supply.length) {
        for (const spawn of sliceByTime(log.spawns, segOpen - 2, seg.end + 4)) {
            if (mobOfSpawn(spawn.bp).kind !== 3) supply.push({ t: spawn.t, n: 1 })
        }
    }
    supply.sort((a, b) => a.t - b.t)

    const step = Math.max(1, Math.ceil(span / 120))
    const cumKills: SeriesPoint[] = []
    const cumSpawns: SeriesPoint[] = []
    const gapSeries: SeriesPoint[] = []
    let gapMax = { t: 0, gap: 0 }
    {
        let spawnIndex = 0
        let spawnCount = 0
        let killIndex = 0
        for (let i = 0; i <= span; i += step) {
            while (spawnIndex < supply.length && supply[spawnIndex].t - t0 <= i) {
                spawnCount += supply[spawnIndex].n
                spawnIndex++
            }
            while (killIndex < kills.length && kills[killIndex].t - t0 <= i) killIndex++
            cumSpawns.push({ t: i, v: spawnCount })
            cumKills.push({ t: i, v: killIndex })
            if (supply.length) {
                const gap = spawnCount - killIndex
                gapSeries.push({ t: i, v: gap })
                if (gap > gapMax.gap) gapMax = { t: i, gap }
            }
        }
    }

    // 击杀节奏分桶
    const rhythm: SeriesPoint[] = []
    {
        let killIndex = 0
        for (let i = 0; i <= span; i += step) {
            const end = i + step
            while (killIndex < kills.length && kills[killIndex].t - t0 < end) killIndex++
            rhythm.push({ t: i, v: killIndex })
        }
        let prev = 0
        for (const point of rhythm) {
            const current = point.v
            point.v = current - prev
            prev = current
        }
    }

    // 空间：击杀点 + 命中落点 + 怪物创建点共用本局取景框
    const points = kills
        .filter(k => k.x !== null)
        .map(k => ({ x: k.x as number, y: k.y as number, t: k.t - t0, boss: isBossKill(mobOf(k)) }))
    const killBounds = robustBounds(points)
    const hitList = sliceByTime(log.hits, segOpen - 2, seg.end + 4)
    const hitBounds = robustBounds(hitList)
    const spaceBounds = mergeBounds(killBounds, hitBounds)
    const spaceSpawns = sliceByTime(log.unitCreates, segOpen - 2, seg.end + 4)
        .filter(u => u.unitType === "Monster")
        .map(u => ({ t: u.t - t0, x: u.x, y: u.y }))
    const concentration = hotConcentration(points, killBounds)

    // 技能施放：本局时窗内的 RealUseSkill，按 Eid → 角色、完整技能 ID 聚合
    const castsMap = new Map<string, { eid: number; sid: string; count: number }>()
    const skillFrom = segOpen - 4
    const skillTo = segEnd0 + 4
    for (const ev of sliceByTime(log.skillEvents, skillFrom, skillTo)) {
        if (!getIndexes().charById.has(Number(ev.pre))) continue
        const key = `${ev.eid}|${ev.sid}`
        const row = castsMap.get(key) ?? { eid: ev.eid, sid: ev.sid, count: 0 }
        row.count++
        castsMap.set(key, row)
    }
    const skillCasts = [...castsMap.values()].sort((a, b) => b.count - a.count)
    const groups = new Map<number, SkillGroup>()
    for (const cast of skillCasts) {
        const ch = segEid.get(cast.eid) ?? globalEid.get(cast.eid) ?? null
        const cid = ch?.id ?? (Number(cast.sid.slice(0, 4)) || null)
        const charName = ch?.cn ?? (cid != null ? (getIndexes().charById.get(cid)?.name ?? null) : null)
        let group = groups.get(cast.eid)
        if (!group) {
            group = {
                eid: cast.eid,
                name: charName ?? `Eid ${cast.eid}`,
                slots: party.filter(p => p.eid === cast.eid).map(p => p.slot),
                skills: [],
            }
            groups.set(cast.eid, group)
        }
        const row: SkillRow = {
            skillId: Number(cast.sid),
            name: skillNames[cast.sid] ?? getIndexes().charSkillNames.get(Number(cast.sid)) ?? null,
            count: cast.count,
        }
        group.skills.push(row)
    }
    for (const group of groups.values()) group.skills.sort((a, b) => b.count - a.count)

    const reasonMap = new Map<string, number>()
    for (const k of kills) {
        const reason = k.reason ?? "未知"
        reasonMap.set(reason, (reasonMap.get(reason) ?? 0) + 1)
    }
    const deathsByReason = [...reasonMap.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count)

    const wallOpen = seg.enterT
    const wallEnd = seg.end
    const wallDur = Math.max(0, wallEnd - wallOpen)
    const level = seg.level?.lv ?? seg.anchor?.level ?? seg.hardBoss?.level ?? null
    const info: SessionInfo = {
        dungeonId: seg.dungeonId,
        dungeonName: seg.gameName ?? seg.level?.name ?? null,
        mapId: seg.mapId,
        mapName: seg.mapCn,
        mode: seg.anchor?.mode ?? null,
        level,
        floor: seg.floor,
        hardBoss: seg.hardBoss
            ? {
                  bossId: seg.hardBoss.boss,
                  diff: seg.hardBoss.diff,
                  level: seg.hardBoss.level,
                  name: seg.hardBoss.name,
                  region: seg.hardBoss.region,
              }
            : null,
        gameName: seg.gameName,
    }
    const labelParts: string[] = []
    if (level != null) labelParts.push(`Lv.${level}`)
    const sessionName =
        info.dungeonName ??
        info.gameName ??
        (info.dungeonId != null ? `副本 ${info.dungeonId}` : null) ??
        info.hardBoss?.name ??
        info.mapName
    if (sessionName) labelParts.push(sessionName)
    const label = labelParts.length ? labelParts.join(" · ") : `第 ${seg.i + 1} 局`

    return {
        index: seg.i,
        label,
        start: seg.start,
        enterT: seg.enterT,
        end: seg.end,
        settleT: seg.settleT,
        wallDur,
        combatDur,
        win: seg.win,
        playerTime: seg.playerTime,
        info,
        kills: kills.map(toKillEntry),
        bossKills: bossKills.map(toKillEntry),
        bossSpawns,
        summons: summons.map(toKillEntry),
        rate: combatDur > 0 ? (kills.length / combatDur) * 60 : 0,
        bursts,
        peak3s,
        lifetime,
        composition,
        cumKills,
        cumSpawns,
        gapSeries,
        gapMax,
        aliveSeries,
        rhythmBucket: step,
        rhythm,
        space: {
            kills: points,
            // P8 参考口径：命中点 t 以本局首个命中点为基准，absT 保留绝对时刻
            hits: hitList.map(h => ({
                t: hitList.length ? h.t - hitList[0].t : 0,
                x: h.x,
                y: h.y,
                absT: h.t,
            })),
            spawns: spaceSpawns,
            bounds: spaceBounds ? { minX: spaceBounds.x0, maxX: spaceBounds.x1, minY: spaceBounds.y0, maxY: spaceBounds.y1 } : null,
        },
        concentration,
        board,
        mvpScore: mvpMeta ? mvpMeta.score : null,
        mvpFactor: factor,
        totalDamage,
        deathsByReason,
        skills: [...groups.values()],
        preloads,
        quotas,
        loot,
        events: buildEvents(log, seg, seg.hardBoss?.name ?? null),
        party,
        rift,
        rewardRate,
    }
}

function mobOfSpawn(bp: string): { name: string; kind: MobKind } {
    return resolveMonster(bp)
}

/* ---------- 入口 ---------- */

/**
 * 把结构化日志事件转换成按结算切分的会话列表。
 * @param events Rust 后端按日志顺序上报的事件（可以跨多次启动追加）
 */
export function analyzeLog(events: AnalysisLogEvent[]): AnalysisSession[] {
    const log = parseEvents(events)
    const segments = buildSegments(log)
    if (!segments.length) return []

    const ctx: Context = { log }
    const globalEid = buildGlobalEidChars(log)
    return segments.map(seg => {
        const segEid = buildEidChars(log, seg.enterT, seg.settleT ?? seg.end)
        return computeSession(ctx, seg, segEid, globalEid)
    })
}
