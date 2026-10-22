import { describe, expect, it } from "vitest"
import {
    AFK_DUNGEON_ALIASES,
    type AfkDrop,
    type AfkRun,
    afkDungeonName,
    buildSnapshot,
    groupDropsByItem,
    groupStatsByDungeon,
    normalizeAfkSnapshot,
    startOfDay,
    trendBuckets,
} from "@/utils/afk-ledger"

const NOW = new Date(2026, 9, 22, 12, 0, 0).getTime()
const DAY = startOfDay(NOW)
const SESSION = DAY + 3600_000

const RUNS: AfkRun[] = [
    {
        id: 1,
        sessionId: SESSION,
        dungeonId: "64102",
        dungeonName: "扼守/无尽",
        startedAt: DAY + 8 * 3600_000,
        endedAt: DAY + 8 * 3600_000 + 180_000,
        status: "done",
    },
    {
        id: 2,
        sessionId: SESSION - 86_400_000,
        dungeonId: "64102",
        dungeonName: "扼守/无尽",
        startedAt: DAY - 86_400_000 + 9 * 3600_000,
        endedAt: DAY - 86_400_000 + 9 * 3600_000 + 240_000,
        status: "done",
    },
    {
        id: 3,
        sessionId: SESSION,
        dungeonId: "616006",
        dungeonName: "避险",
        startedAt: DAY + 10 * 3600_000,
        endedAt: null,
        status: "running",
    },
]

const DROPS: AfkDrop[] = [
    {
        id: 1,
        sessionId: SESSION,
        runId: 1,
        dungeonId: "64102",
        dungeonName: "扼守/无尽",
        at: DAY + 8 * 3600_000 + 60_000,
        kind: "reward",
        itemId: 30001,
        itemName: "生物萃取物",
        itemType: "Resource",
        rarity: 5,
        count: 2,
    },
    {
        id: 2,
        sessionId: SESSION,
        runId: 1,
        dungeonId: "64102",
        dungeonName: "扼守/无尽",
        at: DAY + 8 * 3600_000 + 120_000,
        kind: "reward",
        itemId: 51007,
        itemName: "坚守",
        itemType: "Mod",
        rarity: 5,
        count: 1,
    },
    {
        id: 3,
        sessionId: SESSION - 86_400_000,
        runId: 2,
        dungeonId: "64102",
        dungeonName: "扼守/无尽",
        at: DAY - 86_400_000 + 9 * 3600_000 + 60_000,
        kind: "craft",
        itemId: null,
        itemName: "金砂",
        itemType: "Resource",
        rarity: 4,
        count: 3,
    },
    {
        id: 4,
        sessionId: SESSION,
        runId: null,
        dungeonId: "",
        dungeonName: "",
        at: DAY + 11 * 3600_000,
        kind: "reward",
        itemId: 30002,
        itemName: "精工磁石",
        itemType: "Resource",
        rarity: 3,
        count: 1,
    },
]

describe("buildSnapshot", () => {
    it("按今日与本次连接分别累计，并保留所有副本来源", () => {
        const snapshot = buildSnapshot(RUNS, DROPS, SESSION, NOW)
        expect(snapshot.today).toEqual({ runs: 1, drops: 4, gold: 3 })
        expect(snapshot.session).toEqual({ runs: 1, drops: 4, gold: 3 })
        expect(snapshot.dungeons["64102"]).toMatchObject({
            name: "扼守/无尽",
            today: { runs: 1, drops: 3, gold: 3 },
            session: { runs: 1, drops: 3, gold: 3 },
        })
        expect(snapshot.dungeons["616006"]).toMatchObject({ name: "避险", today: { runs: 0, drops: 0, gold: 0 } })
    })
})

describe("normalizeAfkSnapshot", () => {
    it("接受完整快照，拒绝缺字段的对象", () => {
        const snapshot = buildSnapshot(RUNS, DROPS, SESSION, NOW)
        expect(normalizeAfkSnapshot(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot)
        expect(normalizeAfkSnapshot({ today: { runs: 1 } })).toBeNull()
        expect(normalizeAfkSnapshot(null)).toBeNull()
    })
})

describe("trendBuckets", () => {
    it("把掉落按小时分桶，金色单独累计", () => {
        const points = trendBuckets(DROPS, DAY, DAY + 12 * 3600_000, 3600_000)
        expect(points).toHaveLength(12)
        expect(points[8]).toMatchObject({ drops: 3, gold: 3 })
        expect(points[11]).toMatchObject({ drops: 1, gold: 0 })
    })
})

describe("groupDropsByItem", () => {
    it("同 ID 同名合并，按件数倒序", () => {
        const rows = groupDropsByItem(DROPS)
        expect(rows[0]).toMatchObject({ name: "金砂", count: 3, rarity: 4 })
        expect(rows[1]).toMatchObject({ name: "生物萃取物", count: 2, rarity: 5 })
        expect(rows.map(row => row.name)).toContain("坚守")
    })
})

describe("groupStatsByDungeon", () => {
    it("只统计完成场次，并给出场均掉落与场均时长", () => {
        const rows = groupStatsByDungeon(RUNS, DROPS)
        const dungeon = rows.find(row => row.id === "64102")
        // 铸造产物走独立维度，不再计入副本产出（原口径把 3 件铸造成品算进了副本）
        expect(dungeon).toMatchObject({ runs: 2, drops: 3, gold: 3, avgDrops: 1.5 })
        expect(dungeon?.avgDurationMs).toBe(210_000)
        // 进行中的场次也算一场（页面上显示「进行中」），但不参与场均时长
        const running = rows.find(row => row.id === "616006")
        expect(running?.runs).toBe(1)
        expect(running?.completedRuns).toBe(0)
        expect(running?.avgDurationMs).toBe(0)
    })
})

describe("迷惑性副本 id", () => {
    it("把管道下发的「测试场景」纠正成迷津，并给出资料库入口", () => {
        expect(afkDungeonName("20", "测试场景")).toBe("迷津")
        expect(AFK_DUNGEON_ALIASES["20"]).toBe("迷津")
        // 真实副本保持游戏下发的名字
        expect(afkDungeonName("64102", "扼守/无尽")).toBe("扼守/无尽")
        expect(afkDungeonName("64102", "")).toBe("64102")
    })

    it("聚合结果里的副本名也用纠正后的名字", () => {
        const runs: AfkRun[] = [
            {
                id: 7,
                sessionId: SESSION,
                dungeonId: "20",
                dungeonName: "测试场景",
                startedAt: DAY + 2 * 3600_000,
                endedAt: DAY + 2 * 3600_000 + 60_000,
                status: "done",
            },
        ]
        const snapshot = buildSnapshot(runs, [], SESSION, NOW)
        expect(snapshot.dungeons["20"].name).toBe("迷津")
        expect(groupStatsByDungeon(runs, [])[0].name).toBe("迷津")
    })
})

describe("铸造产物与进行中的场次", () => {
    it("铸造产物不计入副本产出", () => {
        const runs: AfkRun[] = [
            {
                id: 9,
                sessionId: SESSION,
                dungeonId: "64102",
                dungeonName: "扼守/无尽",
                startedAt: DAY + 3 * 3600_000,
                endedAt: DAY + 3 * 3600_000 + 120_000,
                status: "done",
            },
        ]
        const drops: AfkDrop[] = [
            {
                id: 90,
                sessionId: SESSION,
                runId: 9,
                dungeonId: "64102",
                dungeonName: "扼守/无尽",
                at: DAY + 3 * 3600_000 + 60_000,
                kind: "reward",
                itemId: 30001,
                itemName: "生物萃取物",
                itemType: "Resource",
                rarity: 5,
                count: 2,
            },
            {
                id: 91,
                sessionId: SESSION,
                runId: null,
                dungeonId: "",
                dungeonName: "",
                at: DAY + 3 * 3600_000 + 90_000,
                kind: "craft",
                itemId: null,
                itemName: "金羊毛",
                itemType: "Resource",
                rarity: 4,
                count: 7,
            },
        ]
        const row = groupStatsByDungeon(runs, drops)[0]
        expect(row.drops).toBe(2)
        expect(row.gold).toBe(2)
        const snapshot = buildSnapshot(runs, drops, SESSION, NOW)
        expect(snapshot.today.drops).toBe(2)
        expect(snapshot.today.gold).toBe(2)
    })
})
