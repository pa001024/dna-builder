import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { analyzeLog, resolveMonster } from "./analysis"
import type { AnalysisLogEvent } from "./types"

function ev(t: number, k: string, fields: Record<string, unknown> = {}): AnalysisLogEvent {
    return { t, k, ...fields } as unknown as AnalysisLogEvent
}

function readJson<T>(path: string | undefined): T | null {
    if (!path) return null
    return JSON.parse(readFileSync(path, "utf8")) as T
}

const rootCandidates = [process.cwd(), resolve(process.cwd(), "../.."), resolve(process.cwd(), "../../..")]
function findTmp(relative: string) {
    for (const root of rootCandidates) {
        const path = resolve(root, relative)
        if (existsSync(path)) return path
    }
    return undefined
}

describe("resolveMonster", () => {
    it("优先使用 unitId 对应的怪物数据", () => {
        expect(resolveMonster("BP_Boss_Kuxiu", 8513605)).toEqual({ name: "蒙恩的苦修士", kind: 2 })
    })

    it("没有 unitId 时查参考映射表", () => {
        expect(resolveMonster("BP_Boss_Kuxiu")).toEqual({ name: "蒙恩的苦修士", kind: 2 })
        expect(resolveMonster("BP_Baiheng_Summoned")).toEqual({ name: "Baiheng Summoned", kind: 3 })
    })

    it("参考表缺失时按图标前缀匹配", () => {
        const mob = resolveMonster("BP_Mon_Gr_Jichong_C99")
        expect(mob.name).toBe("疾冲秽兽")
        expect(mob.kind).toBe(0)
    })

    it("完全未知时回退蓝图去前缀", () => {
        expect(resolveMonster("BP_Mon_Test_Unknown_C1")).toEqual({ name: "Mon Test Unknown C1", kind: 0 })
        expect(resolveMonster("BP_Boss_Test_Unknown")).toEqual({ name: "Boss Test Unknown", kind: 2 })
    })
})

describe("analyzeLog 分段", () => {
    it("按进本锚点与结算切出多局", () => {
        const events: AnalysisLogEvent[] = [
            ev(88, "map", { name: "/Game/Maps/TestMap" }),
            ev(90, "dunInit", { mode: "AsyncCombat" }),
            ev(95, "unitCreate", { eid: 2, unitId: 8513605, unitType: "Monster", x: 0, y: 0, z: 0 }),
            ev(100, "realDead", { bp: "BP_Boss_Kuxiu", objId: 1 }),
            ev(100.1, "death", { bp: "BP_Boss_Kuxiu", objId: 1, eid: 2, createType: "StaticCreator", creatorId: 1001 }),
            ev(100.2, "deathLoc", { x: 1, y: 2, z: 3 }),
            ev(100.3, "reason", { bp: "BP_Boss_Kuxiu", objId: 1, reason: "Damage" }),
            ev(101, "realDead", { bp: "BP_Mon_Gr_Jichong", objId: 2 }),
            ev(101.1, "reason", { bp: "BP_Mon_Gr_Jichong", objId: 2, reason: "Damage" }),
            ev(110, "finish", { dungeonId: 40604, ok: true, a: 12.5, b: null }),
            ev(200, "dunEnter", { dungeonId: 21701 }),
            ev(205, "realDead", { bp: "BP_Mon_Gr_Piaofu", objId: 10 }),
            ev(205.1, "reason", { bp: "BP_Mon_Gr_Piaofu", objId: 10, reason: "Damage" }),
            ev(206, "realDead", { bp: "BP_Mon_Gr_Piaofu", objId: 11 }),
            ev(210, "finish", { dungeonId: 21701, ok: false, a: null, b: null }),
        ]
        const sessions = analyzeLog(events)
        expect(sessions).toHaveLength(2)

        const [first, second] = sessions
        expect(first.info.dungeonId).toBe(40604)
        expect(first.info.dungeonName).toBe("联袂演绎")
        expect(first.info.mode).toBe("AsyncCombat")
        expect(first.win).toBe(true)
        expect(first.enterT).toBe(90)
        expect(first.start).toBe(100)
        expect(first.end).toBe(101)
        expect(first.settleT).toBe(110)
        expect(first.kills).toHaveLength(2)
        expect(first.kills[0].name).toBe("蒙恩的苦修士")
        expect(first.kills[0]).toMatchObject({ x: 1, y: 2, z: 3, reason: "Damage", eid: 2, unitId: 8513605 })
        expect(first.label).toContain("Lv.110")

        expect(second.info.dungeonId).toBe(21701)
        expect(second.info.dungeonName).toBe("分组赛")
        expect(second.win).toBe(false)
        expect(second.enterT).toBe(200)
        expect(second.kills.map(k => k.name)).toEqual(["飘浮秽兽", "飘浮秽兽"])
        expect(second.index).toBe(1)
    })

    it("提取进本预加载、刷怪配额与本局战利品", () => {
        const events: AnalysisLogEvent[] = [
            ev(80, "preload", { unitId: 8512011, count: 99 }),
            ev(89, "preload", { unitId: 8513605, count: 3 }),
            ev(89.5, "preload", { unitId: 8513605, count: 5 }),
            ev(89.8, "preload", { unitId: 8512011, count: 2 }),
            ev(90, "dunEnter", { dungeonId: 40604 }),
            ev(90.5, "quota", { unitSpawnId: 7, needBefore: 4, quotaLeft: 2, totalNeed: 10 }),
            ev(100, "realDead", { bp: "BP_Boss_Kuxiu", objId: 1 }),
            ev(105, "reward", { json: '{"type":"reward","id":14,"name":"赤色残响","rarity":4,"count":2}' }),
            ev(106, "reward", { json: '{"type":"reward","id":14,"name":"赤色残响","rarity":4,"count":3}' }),
            ev(110, "finish", { dungeonId: 40604, ok: true, a: 12.5, b: null }),
        ]
        const [session] = analyzeLog(events)
        expect(session.preloads.map(p => [p.unitId, p.count])).toEqual([
            [8513605, 5],
            [8512011, 2],
        ])
        expect(session.preloads[0].name).toBe("蒙恩的苦修士")
        expect(session.quotas).toEqual([{ unitSpawnId: 7, needBefore: 4, quotaLeft: 2, totalNeed: 10 }])
        expect(session.loot).toEqual([{ id: 14, name: "赤色残响", rarity: 4, count: 5 }])
    })

    it("开始监听时刻晚于历史日志时，时间倒退修正不会放大跨度", () => {
        // 每条无时间戳行用当前时刻兜底后，历史事件看起来在 60 秒以前；
        // 旧实现会让 offset 逐事件翻倍，最终 new Array(Infinity) 抛 Invalid array length。
        const base = 1_795_263_216
        const events: AnalysisLogEvent[] = [
            ev(1_795_267_380, "cmd", { line: "-EnableShippingLog" }),
            ev(base, "dunEnter", { dungeonId: 40604 }),
            ev(base + 14, "realDead", { bp: "BP_Boss_Kuxiu", objId: 1 }),
            ...Array.from({ length: 80 }, (_, i) => ev(base + 15 + i * 0.01, "skill", { eid: 1, skillId: 410321, localRole: 3 })),
            ev(base + 16, "finish", { dungeonId: 40604, ok: true, a: 30, b: null }),
        ]
        const [session] = analyzeLog(events)
        expect(session).toBeTruthy()
        expect(session.wallDur).toBeLessThan(60)
        expect(session.events.some(event => event.kind === "enter")).toBe(true)
    })

    it("未结算的进本尾段从进本锚点取副本信息", () => {
        const events: AnalysisLogEvent[] = [
            ev(90, "dunEnter", { dungeonId: 40604 }),
            ev(100, "realDead", { bp: "BP_Boss_Kuxiu", objId: 1 }),
            ev(110, "realDead", { bp: "BP_Boss_Kuxiu", objId: 2 }),
        ]
        const [session] = analyzeLog(events)
        expect(session.settleT).toBeNull()
        expect(session.info.dungeonId).toBe(40604)
        expect(session.info.dungeonName).toBe("联袂演绎")
        expect(session.label).toContain("联袂演绎")
    })

    it("RealOnDead / 死亡动画 / 明细 / 死因合并成一条击杀", () => {
        const events: AnalysisLogEvent[] = [
            ev(0, "dunInit", { mode: "SoloRaid" }),
            ev(10, "realDead", { bp: "BP_Boss_Kuxiu", objId: 7 }),
            ev(10.1, "death", { bp: "BP_Boss_Kuxiu", objId: 7, eid: 2, createType: "StaticCreator", creatorId: 1001 }),
            ev(10.2, "deathLoc", { x: 4, y: 5, z: 6 }),
            ev(10.3, "deadDetail", { bp: "BP_Boss_Kuxiu", objId: 7, eid: 2, createType: "StaticCreator", creatorId: 1001 }),
            ev(10.4, "reason", { bp: "BP_Boss_Kuxiu", objId: 7, reason: "Damage" }),
            ev(20, "finish", { dungeonId: 21701, ok: true, a: 10, b: 10.1 }),
        ]
        const [session] = analyzeLog(events)
        expect(session.kills).toHaveLength(1)
        expect(session.kills[0]).toMatchObject({ bp: "BP_Boss_Kuxiu", objId: 7, eid: 2, reason: "Damage", x: 4, y: 5, z: 6 })
    })

    it("击杀间隔超过 3.5 秒切分爆发段", () => {
        const events: AnalysisLogEvent[] = [
            ev(0, "dunInit", { mode: "SoloRaid" }),
            ev(1, "realDead", { bp: "BP_Mon_Gr_Jichong", objId: 1 }),
            ev(2, "realDead", { bp: "BP_Mon_Gr_Jichong", objId: 2 }),
            ev(10, "realDead", { bp: "BP_Mon_Gr_Jichong", objId: 3 }),
            ev(30, "finish", { dungeonId: 21701, ok: true, a: null, b: null }),
        ]
        const [session] = analyzeLog(events)
        expect(session.bursts).toHaveLength(2)
        expect(session.bursts[0]).toMatchObject({ count: 2, peak: 2 })
        expect(session.bursts[1]).toMatchObject({ count: 1, peak: 1 })
        expect(session.peak3s).toBe(2)
    })

    it("结算行相近时合并，进本行相近时也合并", () => {
        const events: AnalysisLogEvent[] = [
            ev(0, "dunEnter", { dungeonId: 21701 }),
            ev(1, "dunInit", { mode: "SoloRaid" }),
            ev(5, "realDead", { bp: "BP_Mon_Gr_Jichong", objId: 1 }),
            ev(20, "finish", { dungeonId: 21701, ok: true, a: 12, b: 13 }),
            ev(21, "settle", { win: true, playerTime: 11.5, dungeonId: 21701 }),
        ]
        const sessions = analyzeLog(events)
        expect(sessions).toHaveLength(1)
        expect(sessions[0].settleT).toBe(20)
        expect(sessions[0].playerTime).toBe(12)
        expect(sessions[0].info.mode).toBe("SoloRaid")
    })

    it("只有召唤物时仍能成局，但击杀数为 0", () => {
        const events: AnalysisLogEvent[] = [
            ev(0, "dunInit", { mode: "SoloRaid" }),
            ev(5, "realDead", { bp: "BP_Baiheng_Summoned", objId: 1 }),
            ev(5.1, "reason", { bp: "BP_Baiheng_Summoned", objId: 1, reason: "SummonTimeLife" }),
            ev(10, "finish", { dungeonId: 21701, ok: true, a: null, b: null }),
        ]
        const [session] = analyzeLog(events)
        expect(session.kills).toHaveLength(0)
        expect(session.summons).toHaveLength(1)
        expect(session.rate).toBe(0)
    })

    it("没有击杀时返回空数组", () => {
        expect(analyzeLog([ev(0, "cmd", { line: "x" })])).toEqual([])
    })
})

describe("analyzeLog 协议修正", () => {
    it("P7：坐标行按死亡行自身时刻做 2 秒关联", () => {
        const events: AnalysisLogEvent[] = [
            ev(0, "dunInit", { mode: "SoloRaid" }),
            ev(10, "realDead", { bp: "BP_Boss_Kuxiu", objId: 7 }),
            ev(14, "death", { bp: "BP_Boss_Kuxiu", objId: 7, eid: 2, createType: "StaticCreator", creatorId: 1001 }),
            ev(14.1, "deathLoc", { x: 1, y: 2, z: 3 }),
            ev(20, "death", { bp: "BP_Mon_Gr_Jichong", objId: 8, eid: 3, createType: "Spawner", creatorId: 1 }),
            ev(23.5, "deathLoc", { x: 9, y: 9, z: 9 }),
            ev(40, "finish", { dungeonId: 21701, ok: true, a: null, b: null }),
        ]
        const [session] = analyzeLog(events)
        expect(session.kills.find(k => k.objId === 7)).toMatchObject({ x: 1, y: 2, z: 3 })
        expect(session.kills.find(k => k.objId === 8)?.x).toBeNull()
    })

    it("P8：没有 unitCreate 时用 aiCreate 的 Eid→UnitId 补 BOSS 出生点", () => {
        const events: AnalysisLogEvent[] = [
            ev(0, "dunInit", { mode: "SoloRaid" }),
            ev(1, "aiCreate", { unitId: 8512011, eid: 9 }),
            ev(5, "death", { bp: "BP_Boss_Linen_Summon1", objId: 1, eid: 9, createType: "", creatorId: 0 }),
            ev(5.1, "reason", { bp: "BP_Boss_Linen_Summon1", objId: 1, reason: "Damage" }),
            ev(10, "finish", { dungeonId: 21701, ok: true, a: null, b: null }),
        ]
        const [session] = analyzeLog(events)
        expect(session.bossSpawns).toHaveLength(1)
        expect(session.bossSpawns[0]).toMatchObject({ t: 1, x: null, y: null, unitId: 8512011 })
        expect(session.kills[0]).toMatchObject({ name: "Boss Linen Summon1", kind: 2 })
    })

    it("P11：BOSS 召唤物的 SetName 不污染 pendingActor", () => {
        const events: AnalysisLogEvent[] = [
            ev(0, "dunInit", { mode: "SoloRaid" }),
            ev(1, "slotSet", { slot: "1", bp: "BP_Boss_Linen_Summon1_C_1" }),
            ev(1.1, "slotName", { key: "UI_CHAR_NAME_2401" }),
            ev(1.2, "slotText", { text: "扶疏" }),
            ev(5, "realDead", { bp: "BP_Mon_Gr_Jichong", objId: 1 }),
            ev(6, "realDead", { bp: "BP_Mon_Gr_Jichong", objId: 2 }),
            ev(10, "finish", { dungeonId: 21701, ok: true, a: null, b: null }),
        ]
        const [session] = analyzeLog(events)
        const phantom = session.party.find(slot => slot.name === "扶疏")
        expect(phantom).toMatchObject({ bp: null, eid: null, charId: 2401 })
    })
})

describe("analyzeLog 技能与出战角色", () => {
    it("按本局时窗统计技能并反查角色", () => {
        const events: AnalysisLogEvent[] = [
            ev(0, "dunInit", { mode: "SoloRaid" }),
            ev(1, "slotSet", { slot: "1", bp: "BP_PlayerCharacter_C_1" }),
            ev(2, "skill", { eid: 1, skillId: 410321, localRole: 3 }),
            ev(-10, "skill", { eid: 1, skillId: 410321, localRole: 3 }),
            ev(3, "slotSet", { slot: "1", bp: "BP_PhantomCharacter_C_2" }),
            ev(3.1, "slotName", { key: "UI_CHAR_NAME_2401" }),
            ev(3.2, "slotEn", { code: "Fushu" }),
            ev(3.3, "slotText", { text: "扶疏" }),
            ev(3.4, "eidInit", { bp: "BP_PhantomCharacter_C_2", eid: 5 }),
            ev(4, "skill", { eid: 5, skillId: 240101, localRole: 3 }),
            ev(5, "skill", { eid: 99, skillId: 990001, localRole: 3 }),
            ev(20, "realDead", { bp: "BP_Mon_Gr_Jichong", objId: 1 }),
            ev(21, "realDead", { bp: "BP_Mon_Gr_Jichong", objId: 2 }),
            ev(30, "finish", { dungeonId: 21701, ok: true, a: null, b: null }),
        ]
        const [session] = analyzeLog(events)
        expect(session.party).toHaveLength(2)
        expect(session.party[0]).toMatchObject({ slot: "main", name: "黎瑟·浴火", eid: 1, charId: 4103, casts: 1 })
        expect(session.party[1]).toMatchObject({ name: "扶疏", en: "Fushu", eid: 5, charId: 2401 })
        const skills = new Map<number, number>()
        for (const group of session.skills) for (const row of group.skills) skills.set(row.skillId, row.count)
        expect(skills.get(410321)).toBe(1)
        expect(skills.get(240101)).toBe(1)
        expect(skills.has(990001)).toBe(false)
        expect(session.skills.find(g => g.eid === 1)?.skills[0].name).toBe("涡流狙击")
        expect(session.skills.find(g => g.eid === 5)?.skills[0].name).toBe("提挈浮沉")
    })
})

describe("analyzeLog 大世界 BOSS 与螺旋秘境", () => {
    it("结算 DungeonId 为 -1 时按进战记录还原大世界 BOSS", () => {
        const events: AnalysisLogEvent[] = [
            ev(99, "region", { regionId: 100101 }),
            ev(99.5, "taskbar", { id: 0, status: "enter", name: "西比尔" }),
            ev(100, "hbEnter", { bossId: 1001, diff: 1001 }),
            ev(110, "realDead", { bp: "BP_Boss_Xibi", objId: 1 }),
            ev(110.1, "reason", { bp: "BP_Boss_Xibi", objId: 1, reason: "Damage" }),
            ev(120, "finish", { dungeonId: -1, ok: true, a: null, b: null }),
        ]
        const [session] = analyzeLog(events)
        expect(session.info.dungeonId).toBeNull()
        expect(session.info.hardBoss).toMatchObject({ bossId: 1001, diff: 1001, level: 30, name: "西比尔" })
        expect(session.info.hardBoss?.region).toContain("秽兽肆虐的村庄")
        expect(session.playerTime).toBe(10)
        expect(session.label).toContain("Lv.30")
        expect(session.label).toContain("西比尔")
    })

    it("还原螺旋秘境的房间与最终 BOSS 阶段", () => {
        const events: AnalysisLogEvent[] = [
            ev(0, "dunInit", { mode: "Rift" }),
            ev(0.1, "riftInit"),
            ev(1, "riftTimer", { totalTime: 100 }),
            ev(2, "riftEnterRoom", { roomId: 1 }),
            ev(2.5, "riftSpawn", { roomId: 1, spawnId: 11 }),
            ev(3, "realDead", { bp: "BP_Mon_Gr_Jichong", objId: 1 }),
            ev(10, "riftClear", { roomId: 1 }),
            ev(11, "riftEnterRoom", { roomId: 2 }),
            ev(11.5, "riftSpawn", { roomId: 2, spawnId: 12 }),
            ev(12, "realDead", { bp: "BP_Mon_Gr_Jichong", objId: 2 }),
            ev(20, "riftTotal"),
            ev(21, "riftBossPick", { unitId: 9 }),
            ev(22, "riftBossActive", { eid: 9, unitId: 9 }),
            ev(22.5, "realDead", { bp: "BP_Boss_Xibi", objId: 3 }),
            ev(25, "riftBossDead"),
            ev(30, "finish", { dungeonId: 21701, ok: true, a: null, b: null }),
        ]
        const [session] = analyzeLog(events)
        expect(session.rift).toEqual({
            rooms: 2,
            mobPhase: 17,
            gapToBoss: 2,
            bossName: "西比尔",
            finalBossDead: true,
        })
    })
})

describe("analyzeLog 刷怪供给与空间", () => {
    it("SpawnNextTeam 批次累计成供给曲线并计算积压", () => {
        const events: AnalysisLogEvent[] = [
            ev(0, "dunInit", { mode: "SoloRaid" }),
            ev(5, "team", { index: 1, unitSpawnId: 1, teamLocs: 3 }),
            ev(6, "realDead", { bp: "BP_Mon_Gr_Jichong", objId: 1 }),
            ev(8, "team", { index: 2, unitSpawnId: 2, teamLocs: 2 }),
            ev(9, "realDead", { bp: "BP_Mon_Gr_Jichong", objId: 2 }),
            ev(15, "finish", { dungeonId: 21701, ok: true, a: null, b: null }),
        ]
        const [session] = analyzeLog(events)
        expect(session.cumSpawns.at(-1)?.v).toBe(5)
        expect(session.cumKills.at(-1)?.v).toBe(2)
        expect(session.gapMax.gap).toBe(4)
    })

    it("击杀点集中度与空间点使用同一取景框", () => {
        const events: AnalysisLogEvent[] = [
            ev(0, "dunInit", { mode: "SoloRaid" }),
            ev(1, "realDead", { bp: "BP_Boss_Xibi", objId: 1 }),
            ev(1.05, "death", { bp: "BP_Boss_Xibi", objId: 1, eid: 1, createType: "StaticCreator", creatorId: 1001 }),
            ev(1.1, "deathLoc", { x: 10, y: 10, z: 0 }),
            ev(2, "realDead", { bp: "BP_Boss_Xibi", objId: 2 }),
            ev(2.05, "death", { bp: "BP_Boss_Xibi", objId: 2, eid: 2, createType: "StaticCreator", creatorId: 1001 }),
            ev(2.1, "deathLoc", { x: 10, y: 10, z: 0 }),
            ev(5, "hit", { x: 30, y: 30, z: 0, pawn: "BP_Mon_Gr_Jichong_C_1" }),
            ev(10, "finish", { dungeonId: 21701, ok: true, a: null, b: null }),
        ]
        const [session] = analyzeLog(events)
        expect(session.space.kills).toHaveLength(2)
        expect(session.space.hits).toHaveLength(1)
        expect(session.concentration).toMatchObject({ cells: 1, grid: 12, peak: 1, share: 1 })
        expect(session.space.bounds).not.toBeNull()
    })
})

interface OracleExpected {
    seg: {
        dungeonId: number
        win: boolean
        playerTime: number | null
        enterT: number
        start: number
        end: number
        settleT: number
        elapsed: number
        mapId: string
    }
    st: {
        kills: Array<{ t: number; bp: string; name: string; kind: number; reason: string | null; x: number | null; y: number | null }>
        summons: Array<{ t: number; bp: string; name: string; reason: string | null }>
        board: Array<{ idx: number; name: string; dmg: number; score: number }>
        mvpMeta: { score: number; idx: number; name: string }
        factor: number
        combatDur: number
        wallDur: number
        rate: number
        bursts: Array<{ s: number; e: number; n: number; peak: number }>
        composition: Array<{ bp: string; n: number; name: string; kind: number; boss: boolean }>
        lifetime: { n: number; coverage: number; med: number; avg: number; p90: number }
        points: Array<{ x: number; y: number; t: number; boss: boolean }>
        hitPts: Array<{ x: number; y: number; z: number; t: number; absT: number; bp: string; name: string; kind: number }>
        concentration: { share: number; cells: number; N: number; peak: number }
        skillCasts: Array<{ eid: number; sid: string; cid: number; charName: string; skillName: string; n: number }>
        skillTotal: number
        perSec: number[]
    }
}

const fixturePath = findTmp(".tmp/log-analysis/fixtures/session-40604.events.json")
const expectedPath = findTmp(".tmp/log-analysis/oracle/session-40604.expected.json")
const fixtureEvents = readJson<AnalysisLogEvent[]>(fixturePath)
const expected = readJson<OracleExpected>(expectedPath)

// 夹具在 .tmp 下、不随仓库提交：本地有真实日志夹具时跑 oracle 断言，缺少时只跑合成用例
if (fixtureEvents && expected) {
    const expectedSt = expected.st
    const sessions = analyzeLog(fixtureEvents)
    const [session] = sessions

    describe("session-40604 oracle", () => {
        it("切出唯一会话并与结算信息一致", () => {
            expect(sessions).toHaveLength(1)
            expect(session.info.dungeonId).toBe(expected.seg.dungeonId)
            expect(session.win).toBe(expected.seg.win)
            expect(session.enterT).toBeCloseTo(expected.seg.enterT, 3)
            expect(session.start).toBeCloseTo(expected.seg.start, 3)
            expect(session.end).toBeCloseTo(expected.seg.end, 3)
            expect(session.settleT).toBeCloseTo(expected.seg.settleT, 3)
            expect(session.info.mapId).toBe(expected.seg.mapId)
            expect(session.label).toContain("Lv.110")
            // P3/P4：RealOnDungeonFinish 与 OnDungeonFinish 都给出 PlayerTime
            expect(session.playerTime).toBeCloseTo(71.294860839844, 6)
        })

        it("击杀 / 召唤物 / BOSS 击杀去重后与参考一致", () => {
            expect(session.kills.map(k => k.bp)).toEqual(expectedSt.kills.map(k => k.bp))
            expect(session.kills.map(k => k.name)).toEqual(expectedSt.kills.map(k => k.name))
            expect(session.kills.map(k => k.kind)).toEqual(expectedSt.kills.map(k => k.kind))
            expect(session.kills.map(k => k.reason)).toEqual(expectedSt.kills.map(k => k.reason))
            expect(session.summons).toHaveLength(expectedSt.summons.length)
            expect(session.summons.map(k => k.bp)).toEqual(expectedSt.summons.map(k => k.bp))
            expect(session.bossKills).toHaveLength(11)
        })

        it("P8：BOSS 出生点按 Eid→UnitId 关联", () => {
            expect(session.bossSpawns).toHaveLength(11)
            expect(session.bossSpawns.filter(Boolean)).toHaveLength(11)
            expect(session.bossSpawns[0]?.unitId).toBe(8513605)
            expect(session.bossSpawns.map(spawn => spawn?.unitId)).toContain(8512011)
        })

        it("伤害榜 / MVP / 总伤害", () => {
            expect(session.board.map(row => row.name)).toEqual(expectedSt.board.map(row => row.name))
            expect(session.board.map(row => row.damage)).toEqual(expectedSt.board.map(row => row.dmg))
            expect(session.board.map(row => row.score)).toEqual(expectedSt.board.map(row => row.score))
            expect(session.board[0].mvp).toBe(true)
            expect(session.board.reduce((sum, row) => sum + row.damage, 0)).toBe(expectedSt.board.reduce((sum, row) => sum + row.dmg, 0))
            expect(session.mvpScore).toBeCloseTo(expectedSt.mvpMeta.score, 10)
            expect(session.mvpFactor).toBeCloseTo(expectedSt.factor, 10)
        })

        it("爆发段 / 3 秒峰值 / 构成", () => {
            expect(session.bursts).toHaveLength(expectedSt.bursts.length)
            for (let i = 0; i < session.bursts.length; i++) {
                const burst = session.bursts[i]
                const exp = expectedSt.bursts[i]
                expect(burst.start).toBeCloseTo(exp.s, 6)
                expect(burst.end).toBeCloseTo(exp.e, 6)
                expect(burst.count).toBe(exp.n)
                expect(burst.peak).toBe(exp.peak)
            }
            expect(session.peak3s).toBe(Math.max(...expectedSt.bursts.map(burst => burst.peak)))
            expect(session.composition).toHaveLength(expectedSt.composition.length)
            expect(session.composition.map(row => row.name)).toEqual(expectedSt.composition.map(row => row.name))
            expect(session.composition.map(row => row.count)).toEqual(expectedSt.composition.map(row => row.n))
        })

        it("P17：只统计 Start RealUseSkill（参考实现的 3 倍放大不计）", () => {
            const counts = new Map<number, number>()
            for (const group of session.skills) for (const row of group.skills) counts.set(row.skillId, row.count)
            expect(counts.get(410321)).toBe(49)
            expect(counts.get(420101)).toBe(16)
            expect(counts.get(420111)).toBe(16)
            expect(counts.get(240101)).toBe(9)
            expect(counts.get(240102)).toBe(3)
            expect(counts.get(420102)).toBe(2)
            expect(counts.get(410302)).toBe(1)
            expect([...counts.values()].reduce((a, b) => a + b, 0)).toBe(96)
            for (const row of session.skills.flatMap(group => group.skills)) {
                const ref = expectedSt.skillCasts.find(cast => Number(cast.sid) === row.skillId)
                if (ref) expect(row.name).toBe(ref.skillName)
            }
            expect(session.skills.find(group => group.eid === 1)?.name).toBe("黎瑟·浴火")
            expect(session.party[0]).toMatchObject({ name: "黎瑟·浴火", charId: 4103, casts: 50 })
            expect(session.party.map(slot => slot.name)).toEqual(["黎瑟·浴火", "扶疏", "煜明"])
        })

        it("生死中位数 / 命中点 / 集中度", () => {
            expect(session.lifetime?.med).toBeCloseTo(expectedSt.lifetime.med, 6)
            expect(session.lifetime?.avg).toBeCloseTo(expectedSt.lifetime.avg, 6)
            expect(session.lifetime?.p90).toBeCloseTo(expectedSt.lifetime.p90, 6)
            expect(session.space.hits).toHaveLength(expectedSt.hitPts.length)
            for (let i = 0; i < session.space.hits.length; i++) {
                expect(session.space.hits[i].t).toBeCloseTo(expectedSt.hitPts[i].t, 6)
                expect(session.space.hits[i].absT).toBeCloseTo(expectedSt.hitPts[i].absT, 6)
                expect(session.space.hits[i].x).toBeCloseTo(expectedSt.hitPts[i].x, 3)
                expect(session.space.hits[i].y).toBeCloseTo(expectedSt.hitPts[i].y, 3)
            }
            expect(session.concentration).toMatchObject({
                cells: expectedSt.concentration.cells,
                grid: expectedSt.concentration.N,
                peak: expectedSt.concentration.peak,
                share: expectedSt.concentration.share,
            })
        })

        it("P7：死亡行坐标关联后击杀点 10 个（参考实现只有 2 个）", () => {
            // expected.points 由参考实现生成，只挂上 2 个坐标；修正后应为 10 个。
            expect(expectedSt.points).toHaveLength(2)
            expect(session.space.kills).toHaveLength(10)
            for (const point of session.space.kills) {
                expect(point.boss).toBe(true)
                expect(Number.isFinite(point.x)).toBe(true)
                expect(Number.isFinite(point.y)).toBe(true)
            }
        })

        it("战斗时长 / 总时长 / 速率与修正后的参考一致", () => {
            expect(session.combatDur).toBeCloseTo(expectedSt.combatDur, 6)
            expect(session.wallDur).toBeCloseTo(expectedSt.wallDur, 6)
            expect(session.rate).toBeCloseTo(expectedSt.rate, 6)
        })

        it("奖励加成与事件流可用", () => {
            expect(session.rewardRate).toEqual({ bonus: 1500, exp: 1500 })
            expect(session.events.some(event => event.kind === "enter")).toBe(true)
            expect(session.events.some(event => event.kind === "settle")).toBe(true)
            expect(session.deathsByReason[0]).toEqual({ reason: "Damage", count: 10 })
        })
    })
}
